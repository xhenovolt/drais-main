import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { langFromRequest, personDisplayName } from '@/lib/i18n/localize';

/**
 * GET /api/students/[id]/profile
 * Returns full student profile: personal info, parents, documents,
 * additional_info, and enrollment history with programs per enrollment.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { id: studentId } = await params;
    if (!studentId || !/^\d+$/.test(studentId)) {
      return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
    }

    // Core student + person data
    const [students]: any = await conn.execute(
      `SELECT
         s.id AS student_id,
         s.admission_no,
         s.status AS student_status,
         s.admission_date,
         p.id AS person_id,
         p.first_name,
         p.last_name,
         p.other_name,
         p.first_name_ar,
         p.last_name_ar,
         p.other_name_ar,
         p.full_name_ar,
         p.gender,
         p.date_of_birth,
         p.phone,
         p.email,
         p.photo_url
       FROM students s
       JOIN people p ON s.person_id = p.id
       WHERE s.id = ? AND s.school_id = ?`,
      [studentId, schoolId]
    );

    if (!students.length) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Localized display name + missing flag (Arabic with English fallback).
    {
      const lang = langFromRequest(req);
      const stu = students[0];
      stu.display_name = personDisplayName(lang, stu);
      stu.arabic_name_missing = !(
        (stu.full_name_ar && String(stu.full_name_ar).trim()) ||
        (stu.first_name_ar && String(stu.first_name_ar).trim()) ||
        (stu.last_name_ar && String(stu.last_name_ar).trim())
      );
    }
    const student = students[0];

    // Additional info
    const [additionalRows]: any = await conn.execute(
      `SELECT orphan_status, previous_school, notes
       FROM student_additional_info
       WHERE student_id = ?`,
      [studentId]
    );
    const additional = additionalRows[0] ?? null;

    // Extended profile (place of birth, residence, district, nationality)
    const [profileRows]: any = await conn.execute(
      `SELECT sp.place_of_birth, sp.place_of_residence,
              sp.district_id, d.name AS district_name,
              sp.nationality_id, n.name AS nationality_name, n.code AS nationality_code,
              sp.passport_document_id
       FROM student_profiles sp
       LEFT JOIN districts d ON sp.district_id = d.id
       LEFT JOIN nationalities n ON sp.nationality_id = n.id
       WHERE sp.student_id = ?`,
      [studentId]
    );
    const extended = profileRows[0] ?? null;

    // Family status (parents alive/deceased, guardian, occupations)
    const [familyRows]: any = await conn.execute(
      `SELECT fs.orphan_status_id, os.label AS orphan_status_label,
              fs.primary_guardian_name, fs.primary_guardian_contact, fs.primary_guardian_occupation,
              fs.father_name, fs.father_living_status_id, ls_f.label AS father_living_status_label,
              fs.father_occupation, fs.father_contact,
              fs.notes
       FROM student_family_status fs
       LEFT JOIN orphan_statuses os ON fs.orphan_status_id = os.id
       LEFT JOIN living_statuses ls_f ON fs.father_living_status_id = ls_f.id
       WHERE fs.student_id = ?`,
      [studentId]
    );
    const familyStatus = familyRows[0] ?? null;

    // Next of kin
    const [nokRows]: any = await conn.execute(
      `SELECT id, sequence, name, address, occupation, contact
       FROM student_next_of_kin
       WHERE student_id = ?
       ORDER BY sequence ASC, id ASC`,
      [studentId]
    );

    // Education history (prior schools / levels completed)
    const [eduRows]: any = await conn.execute(
      `SELECT id, education_type, level_name, institution, year_completed
       FROM student_education_levels
       WHERE student_id = ?
       ORDER BY year_completed DESC, id DESC`,
      [studentId]
    );

    // Parents / guardians
    const [parentRows]: any = await conn.execute(
      `SELECT pa.id AS parent_id, pa.name, pa.phone, pa.email, sp.relationship
       FROM student_parents sp
       JOIN parents pa ON sp.parent_id = pa.id
       WHERE sp.student_id = ?`,
      [studentId]
    );

    // Documents
    const [docRows]: any = await conn.execute(
      `SELECT id, document_type, file_url, uploaded_at
       FROM student_documents
       WHERE student_id = ? AND school_id = ?
       ORDER BY uploaded_at DESC`,
      [studentId, schoolId]
    );

    // Contacts (separate from parents — non-parent caregivers, emergency contacts)
    const [contactRows]: any = await conn.execute(
      `SELECT sc.contact_id, sc.relationship, sc.is_primary,
              c.contact_type, c.occupation,
              p.first_name, p.last_name, p.phone, p.email
       FROM student_contacts sc
       JOIN contacts c ON sc.contact_id = c.id
       LEFT JOIN people p ON c.person_id = p.id
       WHERE sc.student_id = ? AND c.deleted_at IS NULL
       ORDER BY sc.is_primary DESC, p.first_name`,
      [studentId]
    );

    // Fingerprint enrollment summary
    const [fpRows]: any = await conn.execute(
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count
       FROM student_fingerprints
       WHERE student_id = ? AND school_id = ?`,
      [studentId, schoolId]
    );
    const fingerprintSummary = fpRows[0]
      ? { total: Number(fpRows[0].total) || 0, active: Number(fpRows[0].active_count) || 0 }
      : { total: 0, active: 0 };

    // Enrollment history
    const [enrollmentRows]: any = await conn.execute(
      `SELECT
         e.id AS enrollment_id,
         e.class_id,
         c.name AS class_name,
         e.stream_id,
         st.name AS stream_name,
         e.academic_year_id,
         ay.name AS academic_year_name,
         e.term_id,
         t.name AS term_name,
         e.study_mode_id,
         sm.name AS study_mode_name,
         e.enrollment_type,
         e.status,
         e.enrollment_date,
         e.end_date,
         e.end_reason
       FROM enrollments e
       LEFT JOIN classes c ON e.class_id = c.id
       LEFT JOIN streams st ON e.stream_id = st.id
       LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
       LEFT JOIN terms t ON e.term_id = t.id
       LEFT JOIN study_modes sm ON e.study_mode_id = sm.id
       WHERE e.student_id = ? AND e.school_id = ?
       ORDER BY e.enrollment_date DESC, e.id DESC`,
      [studentId, schoolId]
    );

    // Programs per enrollment (batch)
    if (enrollmentRows.length > 0) {
      const eids: number[] = enrollmentRows.map((r: any) => r.enrollment_id);
      const placeholders = eids.map(() => '?').join(',');
      const [epRows]: any = await conn.execute(
        `SELECT ep.enrollment_id, pr.id AS program_id, pr.name AS program_name
         FROM enrollment_programs ep
         JOIN programs pr ON ep.program_id = pr.id
         WHERE ep.enrollment_id IN (${placeholders})`,
        eids
      );
      const programMap: Record<number, { id: number; name: string }[]> = {};
      for (const ep of epRows) {
        if (!programMap[ep.enrollment_id]) programMap[ep.enrollment_id] = [];
        programMap[ep.enrollment_id].push({ id: ep.program_id, name: ep.program_name });
      }
      for (const row of enrollmentRows) row.programs = programMap[row.enrollment_id] ?? [];
    }

    return NextResponse.json({
      success: true,
      data: {
        ...student,
        additional,
        extended,
        family_status: familyStatus,
        next_of_kin: nokRows,
        education_levels: eduRows,
        parents: parentRows,
        contacts: contactRows,
        documents: docRows,
        fingerprints: fingerprintSummary,
        enrollments: enrollmentRows,
      },
    });
  } catch (error) {
    console.error('Error fetching student profile:', error);
    return NextResponse.json({ error: 'Failed to fetch student profile' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

/**
 * PUT /api/students/[id]/profile
 * Upserts the singleton extended-profile blocks:
 *   - additional   → student_additional_info (orphan_status text, previous_school, notes)
 *   - extended     → student_profiles (place_of_birth, place_of_residence, district_id, nationality_id)
 *   - family_status → student_family_status (orphan/guardian/father/mother)
 *
 * Only sends the keys present in the body. Missing blocks are left untouched.
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'learners.profile.update', session.isSuperAdmin);

    const { id: studentId } = await params;
    if (!studentId || !/^\d+$/.test(studentId)) {
      return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
    }

    // Verify student belongs to this school
    const [rows]: any = await conn.execute(
      `SELECT id FROM students WHERE id = ? AND school_id = ?`,
      [studentId, session.schoolId]
    );
    if (!rows.length) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

    const body = await req.json();
    const sid = Number(studentId);

    if (body.additional && typeof body.additional === 'object') {
      const a = body.additional;
      await conn.execute(
        `INSERT INTO student_additional_info (student_id, orphan_status, previous_school, notes)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           orphan_status = VALUES(orphan_status),
           previous_school = VALUES(previous_school),
           notes = VALUES(notes)`,
        [sid, a.orphan_status ?? null, a.previous_school ?? null, a.notes ?? null]
      );
    }

    if (body.extended && typeof body.extended === 'object') {
      const e = body.extended;
      // student_profiles has no UNIQUE on student_id; emulate upsert
      const [existing]: any = await conn.execute(
        `SELECT student_id FROM student_profiles WHERE student_id = ?`,
        [sid]
      );
      if (existing.length) {
        await conn.execute(
          `UPDATE student_profiles
             SET place_of_birth = ?, place_of_residence = ?, district_id = ?, nationality_id = ?, updated_at = NOW()
           WHERE student_id = ?`,
          [
            e.place_of_birth ?? null,
            e.place_of_residence ?? null,
            e.district_id ?? null,
            e.nationality_id ?? null,
            sid,
          ]
        );
      } else {
        await conn.execute(
          `INSERT INTO student_profiles (student_id, place_of_birth, place_of_residence, district_id, nationality_id)
           VALUES (?, ?, ?, ?, ?)`,
          [
            sid,
            e.place_of_birth ?? null,
            e.place_of_residence ?? null,
            e.district_id ?? null,
            e.nationality_id ?? null,
          ]
        );
      }
    }

    if (body.family_status && typeof body.family_status === 'object') {
      const f = body.family_status;
      const [existing]: any = await conn.execute(
        `SELECT student_id FROM student_family_status WHERE student_id = ?`,
        [sid]
      );
      const cols = [
        f.orphan_status_id ?? null,
        f.primary_guardian_name ?? null,
        f.primary_guardian_contact ?? null,
        f.primary_guardian_occupation ?? null,
        f.father_name ?? null,
        f.father_living_status_id ?? null,
        f.father_occupation ?? null,
        f.father_contact ?? null,
        f.notes ?? null,
      ];
      if (existing.length) {
        await conn.execute(
          `UPDATE student_family_status SET
             orphan_status_id = ?, primary_guardian_name = ?, primary_guardian_contact = ?,
             primary_guardian_occupation = ?, father_name = ?, father_living_status_id = ?,
             father_occupation = ?, father_contact = ?, notes = ?, updated_at = NOW()
           WHERE student_id = ?`,
          [...cols, sid]
        );
      } else {
        await conn.execute(
          `INSERT INTO student_family_status
             (student_id, orphan_status_id, primary_guardian_name, primary_guardian_contact,
              primary_guardian_occupation, father_name, father_living_status_id,
              father_occupation, father_contact, notes, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
          [sid, ...cols]
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error?.statusCode === 403) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('Error updating student profile:', error);
    return NextResponse.json({ error: 'Failed to update student profile' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
