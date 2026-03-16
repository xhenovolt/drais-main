import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Student Lifecycle API
 * GET /api/students/lifecycle?student_id=X
 * 
 * Returns comprehensive lifecycle data for a student:
 * - Current enrollment and status
 * - Full enrollment history across all academic years
 * - All report cards across all years
 * - Promotion history
 */
export async function GET(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const studentId = req.nextUrl.searchParams.get('student_id');
    if (!studentId) {
      return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
    }

    // 1. Current student info with active enrollment
    const [studentRows]: any = await conn.execute(`
      SELECT
        s.id AS student_id,
        s.admission_no,
        s.admission_date,
        s.status AS student_status,
        s.promotion_status,
        s.last_promoted_at,
        s.previous_class_id,
        s.previous_year_id,
        s.graduation_date,
        p.first_name,
        p.last_name,
        p.other_name,
        p.gender,
        p.date_of_birth,
        p.photo_url,
        e.id AS enrollment_id,
        c.id AS class_id,
        c.name AS class_name,
        c.level AS class_level,
        st.name AS stream_name,
        ay.id AS academic_year_id,
        ay.name AS academic_year_name,
        t.id AS term_id,
        t.name AS term_name,
        prev_c.name AS previous_class_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      LEFT JOIN terms t ON e.term_id = t.id
      LEFT JOIN classes prev_c ON s.previous_class_id = prev_c.id
      WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL
      LIMIT 1
    `, [studentId, schoolId]);

    if (studentRows.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    const student = studentRows[0];

    // 2. Full enrollment history (all years, all classes)
    const [enrollmentHistory]: any = await conn.execute(`
      SELECT
        e.id AS enrollment_id,
        c.id AS class_id,
        c.name AS class_name,
        c.level AS class_level,
        st.name AS stream_name,
        ay.id AS academic_year_id,
        ay.name AS academic_year_name,
        e.status AS enrollment_status,
        e.enrollment_date,
        e.end_date,
        e.end_reason
      FROM enrollments e
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      WHERE e.student_id = ?
      ORDER BY ay.start_date DESC, e.id DESC
    `, [studentId]);

    // 3. All report cards across all years
    const [reportCards]: any = await conn.execute(`
      SELECT
        rc.id AS report_card_id,
        rc.term_id,
        t.name AS term_name,
        rc.academic_year_id,
        COALESCE(ay.name, ay2.name) AS academic_year_name,
        c.name AS class_name,
        rc.overall_grade,
        rc.class_teacher_comment,
        rc.headteacher_comment,
        rc.dos_comment,
        rc.report_date,
        rc.status AS report_status,
        rcm.total_score,
        rcm.average_score,
        rcm.position,
        rcm.promoted
      FROM report_cards rc
      LEFT JOIN terms t ON rc.term_id = t.id
      LEFT JOIN academic_years ay ON rc.academic_year_id = ay.id
      LEFT JOIN academic_years ay2 ON t.academic_year_id = ay2.id
      LEFT JOIN enrollments e ON rc.enrollment_id = e.id
      LEFT JOIN classes c ON COALESCE(rc.class_id, e.class_id) = c.id
      LEFT JOIN report_card_metrics rcm ON rc.id = rcm.report_card_id
      WHERE rc.student_id = ?
      ORDER BY COALESCE(ay.start_date, ay2.start_date) DESC, t.start_date DESC
    `, [studentId]);

    // 4. Promotion history
    const [promotions]: any = await conn.execute(`
      SELECT
        pr.id AS promotion_id,
        fc.name AS from_class_name,
        fc.level AS from_class_level,
        tc.name AS to_class_name,
        tc.level AS to_class_level,
        fay.name AS from_year_name,
        tay.name AS to_year_name,
        pr.promotion_status,
        pr.criteria_used,
        pr.remarks,
        pr.created_at AS promoted_at
      FROM promotions pr
      LEFT JOIN classes fc ON pr.from_class_id = fc.id
      LEFT JOIN classes tc ON pr.to_class_id = tc.id
      LEFT JOIN academic_years fay ON pr.from_academic_year_id = fay.id
      LEFT JOIN academic_years tay ON pr.to_academic_year_id = tay.id
      WHERE pr.student_id = ? AND pr.school_id = ?
      ORDER BY pr.created_at DESC
    `, [studentId, schoolId]);

    // 5. Results summary per year/term
    const [resultsSummary]: any = await conn.execute(`
      SELECT
        COALESCE(ay.name, 'Unknown') AS academic_year_name,
        ay.id AS academic_year_id,
        t.id AS term_id,
        t.name AS term_name,
        c.name AS class_name,
        COUNT(DISTINCT cr.subject_id) AS subjects_count,
        ROUND(SUM(cr.score), 2) AS total_marks,
        ROUND(AVG(cr.score), 2) AS average_marks,
        MIN(cr.score) AS min_score,
        MAX(cr.score) AS max_score
      FROM class_results cr
      LEFT JOIN terms t ON cr.term_id = t.id
      LEFT JOIN academic_years ay ON COALESCE(cr.academic_year_id, t.academic_year_id) = ay.id
      LEFT JOIN classes c ON cr.class_id = c.id
      WHERE cr.student_id = ?
      GROUP BY ay.id, ay.name, t.id, t.name, c.name
      ORDER BY ay.start_date DESC, t.start_date DESC
    `, [studentId]);

    return NextResponse.json({
      success: true,
      data: {
        student,
        enrollment_history: enrollmentHistory,
        report_cards: reportCards,
        promotions,
        results_summary: resultsSummary,
      }
    });
  } catch (error) {
    console.error('Error fetching student lifecycle:', error);
    return NextResponse.json({ error: 'Failed to fetch student lifecycle' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
