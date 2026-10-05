import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import { logSystemError } from '@/lib/errorLogger';
import { getDbMode } from '@/lib/db/db-mode';

/**
 * local-sqlite branches — Phase 7 sub-effort 32, same §25a pattern as
 * every prior Students route. POST is the real payoff of this sub-effort:
 * the actual "Enroll Student" write action, which needed sub-effort 32's
 * schema migration (study_mode_id/curriculum_id/program_id/joined_at on
 * enrollments) to even be possible — these columns genuinely did not
 * exist on the local table before this sub-effort.
 */
async function offlineGetEnrollments(schoolId: number, searchParams: URLSearchParams) {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const db = getSqliteDb();
  const studentId = searchParams.get('student_id');
  const classId = searchParams.get('class_id');
  const academicYearId = searchParams.get('academic_year_id');
  const status = searchParams.get('status');

  // enrollments has no school_id column locally — scoped via the joined
  // students row instead (same reasoning as the POST branch below).
  let where = 'WHERE s.school_id = ?';
  const params: any[] = [schoolId];
  if (studentId) { where += ' AND e.student_id = ?'; params.push(studentId); }
  if (classId) { where += ' AND e.class_id = ?'; params.push(classId); }
  if (academicYearId) { where += ' AND e.academic_year_id = ?'; params.push(academicYearId); }
  if (status) { where += ' AND e.status = ?'; params.push(status); }

  const rows = db.prepare(`
    SELECT e.id AS enrollment_id, e.student_id, s.admission_no, p.first_name, p.last_name,
      e.class_id, c.name AS class_name, c.level AS class_level,
      e.stream_id, st.name AS stream_name,
      e.academic_year_id, ay.name AS academic_year_name,
      e.term_id, t.name AS term_name,
      e.study_mode_id, sm.name AS study_mode_name,
      e.curriculum_id, cur.name AS curriculum_name,
      e.program_id, pr.name AS program_name,
      e.status, e.enrollment_date, e.end_date, e.end_reason
    FROM enrollments e
    JOIN students s ON e.student_id = s.id
    JOIN people p ON s.person_id = p.id
    LEFT JOIN classes c ON e.class_id = c.id
    LEFT JOIN streams st ON e.stream_id = st.id
    LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
    LEFT JOIN terms t ON e.term_id = t.id
    LEFT JOIN study_modes sm ON e.study_mode_id = sm.id
    LEFT JOIN curriculums cur ON e.curriculum_id = cur.id
    LEFT JOIN programs pr ON e.program_id = pr.id
    ${where}
    ORDER BY ay.start_date DESC, e.id DESC
  `).all(...params) as Record<string, any>[];

  if (rows.length > 0) {
    const enrollmentIds = rows.map((r) => r.enrollment_id);
    const placeholders = enrollmentIds.map(() => '?').join(',');
    const epRows = db.prepare(`
      SELECT ep.enrollment_id, pr.id AS program_id, pr.name AS program_name
      FROM enrollment_programs ep JOIN programs pr ON ep.program_id = pr.id
      WHERE ep.enrollment_id IN (${placeholders})
    `).all(...enrollmentIds) as Array<{ enrollment_id: number; program_id: number; program_name: string }>;
    const programMap: Record<number, { id: number; name: string }[]> = {};
    for (const ep of epRows) {
      if (!programMap[ep.enrollment_id]) programMap[ep.enrollment_id] = [];
      programMap[ep.enrollment_id].push({ id: ep.program_id, name: ep.program_name });
    }
    for (const row of rows) row.programs = programMap[row.enrollment_id] ?? [];
  }
  return NextResponse.json({ success: true, data: rows });
}

async function offlinePostEnrollment(schoolId: number, userId: number, body: any) {
  const { student_id, class_id, stream_id, academic_year_id, term_id, study_mode_id, program_ids, close_previous, enrollment_type } = body;
  if (!student_id || !class_id) return NextResponse.json({ success: false, message: 'student_id and class_id are required', error: { code: 'MISSING_FIELDS' } }, { status: 400 });
  if (!academic_year_id) return NextResponse.json({ success: false, message: 'Academic year is required', error: { code: 'MISSING_ACADEMIC_YEAR' } }, { status: 400 });
  if (!term_id) return NextResponse.json({ success: false, message: 'Term is required', error: { code: 'MISSING_TERM' } }, { status: 400 });
  if (!study_mode_id) return NextResponse.json({ success: false, message: 'Study mode is required', error: { code: 'MISSING_STUDY_MODE' } }, { status: 400 });
  if (!body.curriculum_id) return NextResponse.json({ success: false, message: 'Curriculum is required', error: { code: 'MISSING_CURRICULUM' } }, { status: 400 });
  if (!body.program_id) return NextResponse.json({ success: false, message: 'Program is required', error: { code: 'MISSING_PROGRAM' } }, { status: 400 });

  const curriculum_id = body.curriculum_id;
  const program_id = body.program_id;
  const safeProgramIds: number[] = Array.isArray(program_ids) ? program_ids.filter((x: any) => Number.isInteger(x) && x > 0) : [program_id];

  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const db = getSqliteDb();

  const student = db.prepare(`SELECT s.id, p.first_name, p.last_name FROM students s JOIN people p ON s.person_id = p.id WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL LIMIT 1`).get(student_id, schoolId) as { id: number; first_name: string; last_name: string } | undefined;
  if (!student) return NextResponse.json({ success: false, message: 'Student not found or does not belong to this school', error: { code: 'STUDENT_NOT_FOUND' } }, { status: 404 });
  const studentName = `${student.first_name} ${student.last_name}`;

  const cls = db.prepare(`SELECT id, name FROM classes WHERE id = ? AND school_id = ? LIMIT 1`).get(class_id, schoolId) as { id: number; name: string } | undefined;
  if (!cls) return NextResponse.json({ success: false, message: 'Class not found', error: { code: 'CLASS_NOT_FOUND' } }, { status: 404 });

  const year = db.prepare(`SELECT id FROM academic_years WHERE id = ? AND school_id = ? LIMIT 1`).get(academic_year_id, schoolId);
  if (!year) return NextResponse.json({ success: false, message: 'Academic year not found', error: { code: 'ACADEMIC_YEAR_NOT_FOUND' } }, { status: 404 });

  const term = db.prepare(`SELECT id FROM terms WHERE id = ? AND school_id = ? LIMIT 1`).get(term_id, schoolId);
  if (!term) return NextResponse.json({ success: false, message: 'Term not found', error: { code: 'TERM_NOT_FOUND' } }, { status: 404 });

  // curriculums now has school_id (confirmed live, src/app/api/curriculums/
  // route.ts's own header) — scoped, matching that route's own query, not
  // treated as a truly global table.
  const curriculum = db.prepare(`SELECT id, name FROM curriculums WHERE id = ? AND (school_id = ? OR school_id IS NULL) LIMIT 1`).get(curriculum_id, schoolId) as { id: number; name: string } | undefined;
  if (!curriculum) return NextResponse.json({ success: false, message: 'Curriculum not found', error: { code: 'CURRICULUM_NOT_FOUND' } }, { status: 404 });

  const program = db.prepare(`SELECT id, name FROM programs WHERE id = ? AND school_id = ? AND is_active = 1 LIMIT 1`).get(program_id, schoolId) as { id: number; name: string } | undefined;
  if (!program) return NextResponse.json({ success: false, message: 'Program not found or inactive', error: { code: 'PROGRAM_NOT_FOUND' } }, { status: 404 });

  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  // enrollments has NO school_id column locally at all (confirmed live,
  // sub-effort 15's own design note: "EnrollmentRepo's own listBySchool
  // already scopes through the student, not that column") — student_id
  // alone is sufficient here because it was already validated above to
  // belong to this exact school; no further school_id filter needed or
  // possible on this table.
  let enrollmentId: number;
  let prevEnrollment: { id: number; class_id: number } | undefined;
  const txn = db.transaction(() => {
    prevEnrollment = db.prepare(`SELECT id, class_id FROM enrollments WHERE student_id = ? AND status = 'active' LIMIT 1`).get(student_id) as { id: number; class_id: number } | undefined;

    if (close_previous) {
      db.prepare(`UPDATE enrollments SET status = 'completed', end_date = ?, end_reason = 'promoted' WHERE student_id = ? AND status = 'active'`).run(today, student_id);
    } else {
      db.prepare(`UPDATE enrollments SET status = 'completed', end_date = ?, end_reason = 'reassigned' WHERE student_id = ? AND program_id = ? AND status = 'active'`).run(today, student_id, program_id);
    }

    const result = db.prepare(`
      INSERT INTO enrollments (student_id, class_id, stream_id, academic_year_id, term_id, study_mode_id, curriculum_id, program_id, enrollment_type, status, enrollment_date, joined_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
    `).run(student_id, class_id, stream_id ?? null, academic_year_id, term_id, study_mode_id ?? null, curriculum_id, program_id, enrollment_type ?? 'continuing', today, now, now);
    enrollmentId = Number(result.lastInsertRowid);

    const insertProgram = db.prepare(`INSERT OR IGNORE INTO enrollment_programs (enrollment_id, program_id) VALUES (?, ?)`);
    for (const pid of safeProgramIds) insertProgram.run(enrollmentId, pid);
  });
  txn();

  const className = cls.name;
  const message = prevEnrollment ? `${studentName} moved to ${className}` : `${studentName} enrolled in ${className}`;

  void logAudit({
    schoolId, userId,
    action: prevEnrollment ? AuditAction.REASSIGNED_CLASS : AuditAction.ENROLLED_STUDENT,
    entityType: 'enrollment', entityId: enrollmentId!,
    details: { student_id, class_id, class_name: className, academic_year_id, term_id, study_mode_id, curriculum_id, program_id, previous_enrollment_id: prevEnrollment?.id ?? null },
  }).catch(() => { /* best-effort, matches the online route's own non-blocking audit */ });

  return NextResponse.json({ success: true, message, data: { enrollment_id: enrollmentId! } });
}

/**
 * Enrollments API
 * GET /api/enrollments — List enrollments with filters
 * POST /api/enrollments — Create new enrollment (for promotion or new year)
 */
export async function GET(req: NextRequest) {
  const session0 = await getSessionSchoolId(req);
  if (!session0) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (getDbMode() === 'local-sqlite') {
    return offlineGetEnrollments(session0.schoolId, req.nextUrl.searchParams);
  }

  const conn = await getConnection();
  try {
    const session = session0;
    const schoolId = session.schoolId;

    const studentId = req.nextUrl.searchParams.get('student_id');
    const classId = req.nextUrl.searchParams.get('class_id');
    const academicYearId = req.nextUrl.searchParams.get('academic_year_id');
    const status = req.nextUrl.searchParams.get('status');

    let where = 'WHERE e.school_id = ?';
    const params: any[] = [schoolId];

    if (studentId) {
      where += ' AND e.student_id = ?';
      params.push(studentId);
    }
    if (classId) {
      where += ' AND e.class_id = ?';
      params.push(classId);
    }
    if (academicYearId) {
      where += ' AND e.academic_year_id = ?';
      params.push(academicYearId);
    }
    if (status) {
      where += ' AND e.status = ?';
      params.push(status);
    }

    const [rows]: any = await conn.execute(`
      SELECT
        e.id AS enrollment_id,
        e.student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        e.class_id,
        c.name AS class_name,
        c.level AS class_level,
        e.stream_id,
        st.name AS stream_name,
        e.academic_year_id,
        ay.name AS academic_year_name,
        e.term_id,
        t.name AS term_name,
        e.study_mode_id,
        sm.name AS study_mode_name,
        e.curriculum_id,
        cur.name AS curriculum_name,
        e.program_id,
        pr.name AS program_name,
        e.status,
        e.enrollment_date,
        e.end_date,
        e.end_reason
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      LEFT JOIN terms t ON e.term_id = t.id
      LEFT JOIN study_modes sm ON e.study_mode_id = sm.id
      LEFT JOIN curriculums cur ON e.curriculum_id = cur.id
      LEFT JOIN programs pr ON e.program_id = pr.id
      ${where}
      ORDER BY ay.start_date DESC, e.id DESC
    `, params);

    // Attach programs to each enrollment
    if (rows.length > 0) {
      const enrollmentIds: number[] = rows.map((r: any) => r.enrollment_id);
      const placeholders = enrollmentIds.map(() => '?').join(',');
      const [epRows]: any = await conn.execute(
        `SELECT ep.enrollment_id, pr.id AS program_id, pr.name AS program_name
         FROM enrollment_programs ep
         JOIN programs pr ON ep.program_id = pr.id
         WHERE ep.enrollment_id IN (${placeholders})`,
        enrollmentIds
      );
      const programMap: Record<number, { id: number; name: string }[]> = {};
      for (const ep of epRows) {
        if (!programMap[ep.enrollment_id]) programMap[ep.enrollment_id] = [];
        programMap[ep.enrollment_id].push({ id: ep.program_id, name: ep.program_name });
      }
      for (const row of rows) row.programs = programMap[row.enrollment_id] ?? [];
    }

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching enrollments:', error);
    return NextResponse.json({ error: 'Failed to fetch enrollments' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

/**
 * POST - Create enrollment for promotion or new academic year
 * Body: { student_id, class_id, stream_id?, academic_year_id, term_id?,
 *         study_mode_id?, program_ids?: number[],
 *         close_previous?: boolean, enrollment_type?: string }
 *
 * RULES:
 *   1. Validate student, class, academic_year, term ALL exist in DB
 *   2. Use full SQL TRANSACTION — ROLLBACK on any failure
 *   3. Close previous active enrollment before inserting new one
 *   4. Write audit_logs entry
 *   5. Create a system notification
 *   6. Return structured { success, message, data, error }
 */
export async function POST(req: NextRequest) {
  const session0 = await getSessionSchoolId(req);
  if (!session0) {
    return NextResponse.json({ success: false, message: 'Not authenticated', error: { code: 'AUTH_REQUIRED' } }, { status: 401 });
  }
  let body0: any;
  try { body0 = await req.json(); } catch {
    return NextResponse.json({ success: false, message: 'Invalid JSON body', error: { code: 'INVALID_BODY' } }, { status: 400 });
  }
  if (getDbMode() === 'local-sqlite') {
    return offlinePostEnrollment(session0.schoolId, session0.userId, body0);
  }

  const conn = await getConnection();
  try {
    const session = session0;
    const schoolId = session.schoolId;
    const body = body0;

    const {
      student_id,
      class_id,
      stream_id,
      academic_year_id,
      term_id,
      study_mode_id,
      program_ids,
      close_previous,
      enrollment_type,
    } = body;

    // ── Validate required fields ───────────────────────────────────────────
    if (!student_id || !class_id) {
      return NextResponse.json({ success: false, message: 'student_id and class_id are required', error: { code: 'MISSING_FIELDS' } }, { status: 400 });
    }
    if (!academic_year_id) {
      return NextResponse.json({ success: false, message: 'Academic year is required', error: { code: 'MISSING_ACADEMIC_YEAR' } }, { status: 400 });
    }
    if (!term_id) {
      return NextResponse.json({ success: false, message: 'Term is required', error: { code: 'MISSING_TERM' } }, { status: 400 });
    }
    if (!study_mode_id) {
      return NextResponse.json({ success: false, message: 'Study mode is required', error: { code: 'MISSING_STUDY_MODE' } }, { status: 400 });
    }
    if (!body.curriculum_id) {
      return NextResponse.json({ success: false, message: 'Curriculum is required', error: { code: 'MISSING_CURRICULUM' } }, { status: 400 });
    }
    if (!body.program_id) {
      return NextResponse.json({ success: false, message: 'Program is required', error: { code: 'MISSING_PROGRAM' } }, { status: 400 });
    }

    const curriculum_id = body.curriculum_id;
    const program_id = body.program_id;

    // Backward compat: also accept program_ids array for junction table
    const safeProgramIds: number[] = Array.isArray(program_ids)
      ? program_ids.filter((x: any) => Number.isInteger(x) && x > 0)
      : [program_id];

    // ── Validate entities exist in DB ─────────────────────────────────────
    const [studentRows]: any = await conn.execute(
      'SELECT s.id, p.first_name, p.last_name FROM students s JOIN people p ON s.person_id = p.id WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL LIMIT 1',
      [student_id, schoolId]
    );
    if (studentRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Student not found or does not belong to this school', error: { code: 'STUDENT_NOT_FOUND' } }, { status: 404 });
    }
    const studentName = `${studentRows[0].first_name} ${studentRows[0].last_name}`;

    const [classRows]: any = await conn.execute(
      'SELECT id, name FROM classes WHERE id = ? AND school_id = ? LIMIT 1',
      [class_id, schoolId]
    );
    if (classRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Class not found', error: { code: 'CLASS_NOT_FOUND' } }, { status: 404 });
    }
    const className = classRows[0].name;

    const [yearRows]: any = await conn.execute(
      'SELECT id FROM academic_years WHERE id = ? AND school_id = ? LIMIT 1',
      [academic_year_id, schoolId]
    );
    if (yearRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Academic year not found', error: { code: 'ACADEMIC_YEAR_NOT_FOUND' } }, { status: 404 });
    }

    const [termRows]: any = await conn.execute(
      'SELECT id FROM terms WHERE id = ? AND school_id = ? LIMIT 1',
      [term_id, schoolId]
    );
    if (termRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Term not found', error: { code: 'TERM_NOT_FOUND' } }, { status: 404 });
    }

    // Validate curriculum exists (global table — no school_id)
    const [currRows]: any = await conn.execute(
      'SELECT id, name FROM curriculums WHERE id = ? LIMIT 1',
      [curriculum_id]
    );
    if (currRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Curriculum not found', error: { code: 'CURRICULUM_NOT_FOUND' } }, { status: 404 });
    }
    const curriculumName = currRows[0].name;

    // Validate program exists (school-scoped)
    const [progRows]: any = await conn.execute(
      'SELECT id, name FROM programs WHERE id = ? AND school_id = ? AND is_active = 1 LIMIT 1',
      [program_id, schoolId]
    );
    if (progRows.length === 0) {
      return NextResponse.json({ success: false, message: 'Program not found or inactive', error: { code: 'PROGRAM_NOT_FOUND' } }, { status: 404 });
    }
    const programName = progRows[0].name;

    // ── TRANSACTION ───────────────────────────────────────────────────────
    await conn.beginTransaction();
    try {
      // 1. Get previous active enrollment (for audit trail)
      const [prevRows]: any = await conn.execute(
        `SELECT id, class_id FROM enrollments WHERE student_id = ? AND school_id = ? AND status = 'active' LIMIT 1`,
        [student_id, schoolId]
      );
      const prevEnrollment = prevRows.length > 0 ? prevRows[0] : null;

      // 2. Close previous active enrollments
      // close_previous=true  → close ALL active enrollments (promotion / year-change)
      // close_previous=false → close only the previous enrollment for THIS program,
      //                        leaving other-program enrollments intact (multi-program mode)
      if (close_previous) {
        await conn.execute(
          `UPDATE enrollments SET status = 'completed', end_date = CURDATE(), end_reason = 'promoted', updated_at = NOW()
           WHERE student_id = ? AND school_id = ? AND status = 'active'`,
          [student_id, schoolId]
        );
      } else {
        // Only close the previous enrollment for this specific program
        await conn.execute(
          `UPDATE enrollments SET status = 'completed', end_date = CURDATE(), end_reason = 'reassigned', updated_at = NOW()
           WHERE student_id = ? AND school_id = ? AND program_id = ? AND status = 'active'`,
          [student_id, schoolId, program_id]
        );
      }

      // 3. Insert new enrollment (all 5 dimensions)
      const [result]: any = await conn.execute(
        `INSERT INTO enrollments
           (school_id, student_id, class_id, stream_id, academic_year_id, term_id,
            study_mode_id, curriculum_id, program_id, enrollment_type, status, enrollment_date, enrolled_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURDATE(), NOW())`,
        [
          schoolId, student_id, class_id, stream_id ?? null,
          academic_year_id, term_id, study_mode_id ?? null,
          curriculum_id, program_id,
          enrollment_type ?? 'continuing',
        ]
      );
      const enrollmentId: number = result.insertId;

      // 4. Insert enrollment_programs
      for (const pid of safeProgramIds) {
        await conn.execute(
          'INSERT IGNORE INTO enrollment_programs (enrollment_id, program_id) VALUES (?, ?)',
          [enrollmentId, pid]
        );
      }

      // 5. COMMIT — only now is it real
      await conn.commit();

      // ── Post-commit: Audit + Notification (non-blocking) ──────────────
      const auditDetails = {
        student_id,
        class_id,
        class_name: className,
        stream_id,
        academic_year_id,
        term_id,
        study_mode_id,
        curriculum_id,
        curriculum_name: curriculumName,
        program_id,
        program_name: programName,
        program_ids: safeProgramIds,
        enrollment_type: enrollment_type ?? 'continuing',
        previous_enrollment_id: prevEnrollment?.id ?? null,
        previous_class_id: prevEnrollment?.class_id ?? null,
      };

      // Audit log
      logAudit({
        schoolId,
        userId: session.userId,
        action: prevEnrollment ? AuditAction.REASSIGNED_CLASS : AuditAction.ENROLLED_STUDENT,
        entityType: 'enrollment',
        entityId: enrollmentId,
        details: auditDetails,
        ip: req.headers.get('x-forwarded-for') || null,
        userAgent: req.headers.get('user-agent') || null,
        source: 'WEB',
      }).catch(e => console.error('[enrollments/POST] audit error:', e));

      // Notification — fire-and-forget via a fresh connection
      (async () => {
        try {
          const nConn = await getConnection();
          try {
            const action = prevEnrollment ? 'CLASS_CHANGED' : 'STUDENT_ENROLLED';
            const title  = prevEnrollment ? 'Student Class Changed' : 'Student Enrolled';
            const msg    = prevEnrollment
              ? `${studentName} moved to ${className}`
              : `${studentName} enrolled in ${className}`;
            await nConn.execute(
              `INSERT INTO notifications (school_id, actor_user_id, action, entity_type, entity_id, title, message, priority, channel, created_at)
               VALUES (?, ?, ?, 'enrollment', ?, ?, ?, 'normal', 'in_app', NOW())`,
              [schoolId, session.userId, action, enrollmentId, title, msg]
            );
          } finally { await nConn.end(); }
        } catch (e) { console.error('[enrollments/POST] notification error:', e); }
      })();

      return NextResponse.json({
        success: true,
        message: prevEnrollment
          ? `${studentName} moved to ${className}`
          : `${studentName} enrolled in ${className}`,
        data: { enrollment_id: enrollmentId },
      });
    } catch (txError) {
      await conn.rollback();
      throw txError;
    }
  } catch (error: any) {
    console.error('[ENROLLMENT ERROR]', error);
    await logSystemError({ endpoint: '/api/enrollments', method: 'POST', error, schoolId: null, userId: null });
    return NextResponse.json({
      success: false,
      message: error.message || 'Enrollment failed',
      error: { code: 'ENROLLMENT_FAILED' },
    }, { status: 500 });
  } finally {
    try { await conn.end(); } catch { /* ignore */ }
  }
}
