import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getCurrentTerm } from '@/lib/terms';

/**
 * GET /api/students/enrolled
 *
 * Returns students enrolled in a specific term (defaults to current term).
 * This is the CANONICAL student ENROLLMENT list query — always term-aware.
 * DIFFERENT FROM /api/students/list which returns ALL students regardless of enrollment.
 *
 * Query params:
 *   term_id          — specific term (optional, defaults to current)
 *   academic_year_id — filter by year (optional)
 *   class_id         — filter by class (optional)
 *   stream_id        — filter by stream (optional)
 *   search           — search by name or admission_no (optional)
 *   status           — enrollment status: active|transferred|dropped|completed (default: active)
 *   historical       — if "true", returns ALL enrollments (no term filter)
 *
 * ALL results returned (no backend pagination — frontend handles).
 * School isolation enforced: only returns data for authenticated school.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  const sp = req.nextUrl.searchParams;
  const historical = sp.get('historical') === 'true';
  // No default status filter — 'active' default hides completed/historical enrollments.
  // Pass status=active explicitly in the URL to restrict to active only.
  const enrollmentStatus = sp.get('status');
  const search = sp.get('search')?.trim();
  const classId = sp.get('class_id');
  const streamId = sp.get('stream_id');
  const academicYearId = sp.get('academic_year_id');

  const conn = await getConnection();
  try {
    // Resolve term_id
    let termId: number | null = null;
    if (!historical) {
      const rawTermId = sp.get('term_id');
      if (rawTermId) {
        termId = parseInt(rawTermId, 10);
      } else {
        const current = await getCurrentTerm(schoolId);
        termId = current?.id ?? null;
      }
    }

    // Build WHERE clause
    // Use s.school_id for tenant isolation — authoritative and always present.
    // Do NOT use e.school_id here because enrollments.school_id may be NULL for
    // rows imported before migration 020 ran.
    // Do NOT add e.deleted_at IS NULL here: the column is added by migration 020
    // with NULL default, so it is safe to omit until migration has run. Once it
    // runs, all rows have deleted_at = NULL so behaviour is identical.
    const conditions: string[] = ['s.school_id = ?', 's.deleted_at IS NULL'];
    const params: any[] = [schoolId];

    if (!historical && termId) {
      conditions.push('e.term_id = ?');
      params.push(termId);
    }

    if (enrollmentStatus && enrollmentStatus !== 'all') {
      conditions.push('e.status = ?');
      params.push(enrollmentStatus);
    }

    if (academicYearId) {
      conditions.push('e.academic_year_id = ?');
      params.push(academicYearId);
    }

    if (classId) {
      conditions.push('e.class_id = ?');
      params.push(classId);
    }

    if (streamId) {
      conditions.push('e.stream_id = ?');
      params.push(streamId);
    }

    if (search) {
      conditions.push('(LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ? OR s.admission_no LIKE ? OR LOWER(CONCAT(p.last_name, \' \', p.first_name)) LIKE ? OR LOWER(CONCAT(p.first_name, \' \', p.last_name)) LIKE ?)');
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like, like, like, like);
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    // Fetch data query
    // No pagination — frontend handles all pagination logic.
    // Backend returns complete filtered result set.
    const [rows]: any = await conn.execute(
      `SELECT
         e.id                                   AS enrollment_id,
         e.student_id,
         e.class_id,
         e.stream_id,
         e.academic_year_id,
         e.term_id,
         e.study_mode_id,
         e.program_id,
         e.status                               AS enrollment_status,
         IFNULL(e.enrollment_type, 'new')       AS enrollment_type,
         IFNULL(e.joined_at,       e.created_at) AS joined_at,
         IFNULL(e.enrollment_date, s.admission_date) AS enrollment_date,
         s.id                                   AS id,
         s.person_id,
         s.admission_no,
         s.status                               AS student_status,
         s.admission_date,
         p.first_name,
         p.last_name,
         p.other_name,
         p.gender,
         p.date_of_birth,
         p.photo_url,
         p.phone,
         p.email,
         c.name            AS class_name,
         c.level           AS class_level,
         st.name           AS stream_name,
         ay.name           AS academic_year_name,
         t.name            AS term_name,
         sm.name           AS study_mode_name,
         pr.name           AS program_name
       FROM enrollments e
       JOIN students s      ON e.student_id   = s.id
       LEFT JOIN people p   ON s.person_id    = p.id
       LEFT JOIN classes c         ON e.class_id         = c.id
       LEFT JOIN streams st        ON e.stream_id        = st.id
       LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
       LEFT JOIN terms t           ON e.term_id          = t.id
       LEFT JOIN study_modes sm    ON e.study_mode_id    = sm.id
       LEFT JOIN programs pr       ON e.program_id       = pr.id
       ${where}
       ORDER BY p.first_name ASC, p.last_name ASC`,
      [...params]
    );

    // Fetch programs for each enrollment
    if (rows.length > 0) {
      const enrollmentIds = rows.map((r: any) => r.enrollment_id);
      const placeholders = enrollmentIds.map(() => '?').join(',');
      const [programs]: any = await conn.execute(
        `SELECT ep.enrollment_id, p.id, p.name
         FROM enrollment_programs ep
         JOIN programs p ON ep.program_id = p.id
         WHERE ep.enrollment_id IN (${placeholders})`,
        enrollmentIds
      );

      const programMap: Record<number, Array<{ id: number; name: string }>> = {};
      for (const prog of programs) {
        if (!programMap[prog.enrollment_id]) programMap[prog.enrollment_id] = [];
        programMap[prog.enrollment_id].push({ id: prog.id, name: prog.name });
      }

      for (const row of rows) {
        row.programs = programMap[row.enrollment_id] || [];
      }
    }

    console.log(`[ENROLLED STUDENTS] school=${schoolId}, class=${classId}, returned=${rows.length}, term=${termId}, historical=${historical}`);

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        total: rows.length,
        term_id: termId,
        historical,
      },
    });
  } catch (err) {
    console.error('[students/enrolled] error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch enrolled students' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
