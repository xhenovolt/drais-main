import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Student Historical Reports API
 * GET /api/report-cards/history?student_id=X&academic_year_id=Y&term_id=Z
 * 
 * Returns full report card details with subject breakdown for any past year/term.
 * If no filters besides student_id, returns all report cards.
 */
export async function GET(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const studentId = req.nextUrl.searchParams.get('student_id');
    const academicYearId = req.nextUrl.searchParams.get('academic_year_id');
    const termId = req.nextUrl.searchParams.get('term_id');

    if (!studentId) {
      return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
    }

    let where = 'WHERE rc.student_id = ? AND s.school_id = ?';
    const params: any[] = [studentId, schoolId];

    if (academicYearId) {
      where += ' AND (rc.academic_year_id = ? OR t.academic_year_id = ?)';
      params.push(academicYearId, academicYearId);
    }
    if (termId) {
      where += ' AND rc.term_id = ?';
      params.push(termId);
    }

    // Get report cards with metadata
    const [reportCards]: any = await conn.execute(`
      SELECT
        rc.id AS report_card_id,
        rc.student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        p.gender,
        p.photo_url,
        p.date_of_birth,
        COALESCE(rc.class_id, e.class_id) AS class_id,
        c.name AS class_name,
        c.level AS class_level,
        st.name AS stream_name,
        rc.term_id,
        t.name AS term_name,
        t.start_date AS term_start_date,
        t.end_date AS term_end_date,
        COALESCE(rc.academic_year_id, t.academic_year_id) AS academic_year_id,
        COALESCE(ay.name, ay2.name) AS academic_year_name,
        rc.overall_grade,
        rc.class_teacher_comment,
        rc.headteacher_comment,
        rc.dos_comment,
        rc.report_date,
        rc.status AS report_status,
        rcm.total_score,
        rcm.average_score,
        rcm.min_score,
        rcm.max_score,
        rcm.position,
        rcm.promoted
      FROM report_cards rc
      JOIN students s ON rc.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN terms t ON rc.term_id = t.id
      LEFT JOIN academic_years ay ON rc.academic_year_id = ay.id
      LEFT JOIN academic_years ay2 ON t.academic_year_id = ay2.id
      LEFT JOIN enrollments e ON rc.enrollment_id = e.id
      LEFT JOIN classes c ON COALESCE(rc.class_id, e.class_id) = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN report_card_metrics rcm ON rc.id = rcm.report_card_id
      ${where}
      ORDER BY COALESCE(ay.start_date, ay2.start_date) DESC, t.start_date DESC
    `, params);

    // For each report card, get subject details
    const reports = [];
    for (const rc of reportCards) {
      const [subjects]: any = await conn.execute(`
        SELECT
          rcs.id,
          rcs.subject_id,
          sub.name AS subject_name,
          sub.subject_type,
          rcs.total_score,
          rcs.mid_term_score,
          rcs.end_term_score,
          rcs.grade,
          rcs.remarks,
          rcs.position,
          rcs.teacher_initials
        FROM report_card_subjects rcs
        JOIN subjects sub ON rcs.subject_id = sub.id
        WHERE rcs.report_card_id = ?
        ORDER BY sub.subject_type DESC, sub.name ASC
      `, [rc.report_card_id]);

      reports.push({ ...rc, subjects });
    }

    // Also get available years/terms for this student (for UI dropdowns)
    const [availableYears]: any = await conn.execute(`
      SELECT DISTINCT
        COALESCE(rc.academic_year_id, t.academic_year_id) AS academic_year_id,
        COALESCE(ay.name, ay2.name) AS academic_year_name
      FROM report_cards rc
      LEFT JOIN terms t ON rc.term_id = t.id
      LEFT JOIN academic_years ay ON rc.academic_year_id = ay.id
      LEFT JOIN academic_years ay2 ON t.academic_year_id = ay2.id
      WHERE rc.student_id = ?
      ORDER BY COALESCE(ay.start_date, ay2.start_date) DESC
    `, [studentId]);

    const [availableTerms]: any = await conn.execute(`
      SELECT DISTINCT
        rc.term_id,
        t.name AS term_name,
        COALESCE(rc.academic_year_id, t.academic_year_id) AS academic_year_id
      FROM report_cards rc
      LEFT JOIN terms t ON rc.term_id = t.id
      WHERE rc.student_id = ?
      ORDER BY t.start_date DESC
    `, [studentId]);

    return NextResponse.json({
      success: true,
      data: {
        reports,
        available_years: availableYears,
        available_terms: availableTerms,
      }
    });
  } catch (error) {
    console.error('Error fetching historical reports:', error);
    return NextResponse.json({ error: 'Failed to fetch historical reports' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
