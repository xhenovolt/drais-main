import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Enrollments API
 * GET /api/enrollments — List enrollments with filters
 * POST /api/enrollments — Create new enrollment (for promotion or new year)
 */
export async function GET(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
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
 *         close_previous?: boolean }
 *
 * study_mode_id and program_ids are optional to maintain backwards-compatibility
 * with existing bulk-promotion flows.
 */
export async function POST(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
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

    if (!student_id || !class_id) {
      return NextResponse.json({ error: 'student_id and class_id are required' }, { status: 400 });
    }

    // STRICT VALIDATION: All fields required for enrollment
    if (!study_mode_id) {
      return NextResponse.json(
        { error: 'Study mode is required. Select a study mode before enrolling.' },
        { status: 400 }
      );
    }

    if (!academic_year_id) {
      return NextResponse.json(
        { error: 'Academic year is required' },
        { status: 400 }
      );
    }

    if (!term_id) {
      return NextResponse.json(
        { error: 'Term is required' },
        { status: 400 }
      );
    }

    // Validate program_ids - at least one program required
    const safeProgramIds: number[] = Array.isArray(program_ids)
      ? program_ids.filter((x: any) => Number.isInteger(x) && x > 0)
      : [];

    if (safeProgramIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one program must be selected' },
        { status: 400 }
      );
    }

    await conn.execute('START TRANSACTION');

    try {
      // Close previous active enrollments if requested
      if (close_previous) {
        await conn.execute(`
          UPDATE enrollments
          SET status = 'completed', end_date = CURDATE(), end_reason = 'promoted'
          WHERE student_id = ? AND school_id = ? AND status = 'active'
        `, [student_id, schoolId]);
      }

      // Create new enrollment
      const now = Math.floor(Date.now() / 1000);
      const [result]: any = await conn.execute(`
        INSERT INTO enrollments
          (school_id, student_id, class_id, stream_id, academic_year_id, term_id,
           study_mode_id, enrollment_type, status, enrollment_date, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', CURDATE(), ?)
      `, [
        schoolId,
        student_id,
        class_id,
        stream_id ?? null,
        academic_year_id ?? null,
        term_id ?? null,
        study_mode_id ?? null,
        enrollment_type ?? 'continuing',
        now,
      ]);

      const enrollmentId: number = result.insertId;

      // Insert enrollment_programs rows
      if (safeProgramIds.length > 0) {
        const epValues = safeProgramIds.map((pid) => [enrollmentId, pid]);
        for (const [eid, pid] of epValues) {
          await conn.execute(
            `INSERT IGNORE INTO enrollment_programs (enrollment_id, program_id) VALUES (?, ?)`,
            [eid, pid]
          );
        }
      }

      await conn.execute('COMMIT');

      return NextResponse.json({
        success: true,
        data: { enrollment_id: enrollmentId },
        message: 'Enrollment created',
      });
    } catch (txError) {
      await conn.execute('ROLLBACK');
      throw txError;
    }
  } catch (error) {
    console.error('Error creating enrollment:', error);
    return NextResponse.json({ error: 'Failed to create enrollment' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
