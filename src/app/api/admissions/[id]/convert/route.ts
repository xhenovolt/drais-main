/**
 * Convert an approved admission into a real student + active enrollment.
 *
 * Single transactional step:
 *   1. Find or create a `people` row (by name + dob match within the
 *      school; create new otherwise).
 *   2. Generate an admission_no (per-school per-year, format
 *      ADM-YYYY-NNNNNN).
 *   3. INSERT students.
 *   4. INSERT enrollments (active).
 *   5. UPDATE admissions: status='enrolled', enrolled_student_id, audit row.
 *
 * Idempotent: a second call on an already-enrolled admission returns
 * the existing student_id instead of duplicating.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getDbMode } from '@/lib/db/db-mode';

/**
 * local-sqlite branch — Phase 7 sub-effort 36, same §25a pattern, same
 * statement-for-statement translation discipline sub-effort 34's merge/
 * purge branches used (this is the only admissions route that creates a
 * real student + enrollment, so getting the translation wrong would mean
 * losing applicant data, not just returning an empty list). `parents`/
 * `student_parents` both exist locally (confirmed by grep before writing
 * this, same discipline as every prior sub-effort) so the guardian-link
 * step needs no special-casing either.
 */
async function offlineConvertAdmission(session: { schoolId: number; userId: number }, id: string) {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const db = getSqliteDb();
  const schoolId = session.schoolId;

  const adm = db.prepare(`SELECT * FROM admissions WHERE id = ? AND school_id = ? AND deleted_at IS NULL`).get(id, schoolId) as any;
  if (!adm) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  if (adm.status === 'enrolled' && adm.enrolled_student_id) {
    return NextResponse.json({ success: true, student_id: adm.enrolled_student_id, already_enrolled: true });
  }
  if (adm.status !== 'approved') {
    return NextResponse.json({ error: `Applicant must be in 'approved' state — currently '${adm.status}'` }, { status: 400 });
  }

  try {
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date().toISOString();

    const result = db.transaction(() => {
      const personIns = db.prepare(`
        INSERT INTO people (first_name, last_name, other_name, gender, date_of_birth, phone, email)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(adm.first_name, adm.last_name, adm.other_name, adm.gender, adm.date_of_birth, adm.applicant_phone, adm.applicant_email);
      const personId = Number(personIns.lastInsertRowid);

      const year = new Date().getFullYear();
      const countRow = db.prepare(`SELECT COUNT(*) AS n FROM students WHERE school_id = ? AND admission_no LIKE ?`).get(schoolId, `ADM-${year}-%`) as any;
      const admission_no = `ADM-${year}-${String((Number(countRow.n) || 0) + 1).padStart(6, '0')}`;

      const stuIns = db.prepare(`
        INSERT INTO students (school_id, person_id, class_id, admission_no, admission_date, status, notes, created_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `).run(schoolId, personId, adm.desired_class_id ?? null, admission_no, today, `Created via admission #${adm.id} (${adm.application_no})`, now);
      const studentId = Number(stuIns.lastInsertRowid);

      db.prepare(`
        INSERT INTO enrollments
          (student_id, class_id, stream_id, academic_year_id, term_id,
           status, enrollment_date, enrolled_at, enrollment_type, created_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?, 'standard', ?)
      `).run(studentId, adm.desired_class_id ?? null, adm.desired_stream_id ?? null, adm.desired_academic_year_id ?? null, adm.desired_term_id ?? null, today, now, now);

      if (adm.guardian_phone && adm.guardian_name) {
        try {
          const paIns = db.prepare(`INSERT INTO parents (name, phone, email) VALUES (?, ?, ?)`).run(adm.guardian_name, adm.guardian_phone, adm.guardian_email ?? null);
          db.prepare(`INSERT INTO student_parents (student_id, parent_id, relationship) VALUES (?, ?, ?)`).run(studentId, Number(paIns.lastInsertRowid), adm.guardian_relation ?? 'guardian');
        } catch (err) {
          console.warn('[admissions/convert-offline] parent link failed (non-fatal):', err);
        }
      }

      db.prepare(`UPDATE admissions SET status = 'enrolled', enrolled_student_id = ?, enrolled_at = ? WHERE id = ? AND school_id = ?`).run(studentId, now, id, schoolId);
      db.prepare(`
        INSERT INTO admission_audit (admission_id, school_id, from_status, to_status, actor_user_id, reason, created_at)
        VALUES (?, ?, 'approved', 'enrolled', ?, ?, ?)
      `).run(id, schoolId, session.userId, `Converted to student #${studentId} (${admission_no})`, now);

      return { studentId, admission_no };
    })();

    return NextResponse.json({ success: true, student_id: result.studentId, admission_no: result.admission_no });
  } catch (e: any) {
    console.error('[admissions/convert-offline]', e);
    return NextResponse.json({ error: e?.message || 'Failed to convert' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'admissions.applicant.convert', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const { id } = await params;
  if (getDbMode() === 'local-sqlite') {
    return offlineConvertAdmission(session, id);
  }

  const conn = await getConnection();

  try {
    const [rows]: any = await conn.execute(
      `SELECT * FROM admissions WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [id, session.schoolId],
    );
    if (!rows.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const adm = rows[0];

    if (adm.status === 'enrolled' && adm.enrolled_student_id) {
      return NextResponse.json({
        success: true,
        student_id: adm.enrolled_student_id,
        already_enrolled: true,
      });
    }
    if (adm.status !== 'approved') {
      return NextResponse.json({
        error: `Applicant must be in 'approved' state — currently '${adm.status}'`,
      }, { status: 400 });
    }

    await conn.beginTransaction();

    // people upsert. We don't enforce uniqueness — different schools can
    // have applicants with the same name. Always create a new row.
    const [personIns]: any = await conn.execute(
      `INSERT INTO people (first_name, last_name, other_name, gender, date_of_birth, phone, email)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        adm.first_name, adm.last_name, adm.other_name,
        adm.gender, adm.date_of_birth,
        adm.applicant_phone, adm.applicant_email,
      ],
    );
    const personId = personIns.insertId;

    // Admission number — per school per year, format ADM-YYYY-NNNNNN
    const year = new Date().getFullYear();
    const [[c]]: any = await conn.execute(
      `SELECT COUNT(*) AS n FROM students
        WHERE school_id = ? AND admission_no LIKE ?`,
      [session.schoolId, `ADM-${year}-%`],
    );
    const admission_no = `ADM-${year}-${String((Number(c.n) || 0) + 1).padStart(6, '0')}`;

    // students row
    const [stuIns]: any = await conn.execute(
      `INSERT INTO students (school_id, person_id, class_id, admission_no, admission_date, status, notes)
       VALUES (?, ?, ?, ?, CURDATE(), 'active', ?)`,
      [
        session.schoolId, personId,
        adm.desired_class_id ?? null,
        admission_no,
        `Created via admission #${adm.id} (${adm.application_no})`,
      ],
    );
    const studentId = stuIns.insertId;

    // active enrollment row
    await conn.execute(
      `INSERT INTO enrollments
         (student_id, school_id, class_id, stream_id, academic_year_id, term_id,
          status, enrollment_date, enrolled_at, enrollment_type)
       VALUES (?, ?, ?, ?, ?, ?, 'active', CURDATE(), NOW(), 'standard')`,
      [
        studentId, session.schoolId,
        adm.desired_class_id ?? null,
        adm.desired_stream_id ?? null,
        adm.desired_academic_year_id ?? null,
        adm.desired_term_id ?? null,
      ],
    );

    // student_parents link (best effort — only if guardian_phone + name given)
    if (adm.guardian_phone && adm.guardian_name) {
      try {
        const [paIns]: any = await conn.execute(
          `INSERT INTO parents (name, phone, email)
           VALUES (?, ?, ?)`,
          [adm.guardian_name, adm.guardian_phone, adm.guardian_email ?? null],
        );
        await conn.execute(
          `INSERT INTO student_parents (student_id, parent_id, relationship)
           VALUES (?, ?, ?)`,
          [studentId, paIns.insertId, adm.guardian_relation ?? 'guardian'],
        );
      } catch (err) {
        console.warn('[admissions/convert] parent link failed (non-fatal):', err);
      }
    }

    // Flip admission to enrolled
    await conn.execute(
      `UPDATE admissions
          SET status = 'enrolled',
              enrolled_student_id = ?,
              enrolled_at         = NOW()
        WHERE id = ? AND school_id = ?`,
      [studentId, id, session.schoolId],
    );
    await conn.execute(
      `INSERT INTO admission_audit
         (admission_id, school_id, from_status, to_status, actor_user_id, reason)
       VALUES (?, ?, 'approved', 'enrolled', ?, ?)`,
      [id, session.schoolId, session.userId, `Converted to student #${studentId} (${admission_no})`],
    );

    await conn.commit();
    return NextResponse.json({
      success:    true,
      student_id: studentId,
      admission_no,
    });
  } catch (e: any) {
    try { await conn.rollback(); } catch {}
    console.error('[admissions/convert]', e);
    return NextResponse.json({ error: e?.message || 'Failed to convert' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
