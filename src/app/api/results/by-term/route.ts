import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Exam Results by Term and Academic Year
 * GET /api/results/by-term?student_id=X&term_id=Y&academic_year_id=Z&class_id=W
 * 
 * Returns detailed exam results filtered by term and/or academic year.
 * Used for generating term-specific and historical reports.
 */
export async function GET(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const studentId = req.nextUrl.searchParams.get('student_id');
    const termId = req.nextUrl.searchParams.get('term_id');
    const academicYearId = req.nextUrl.searchParams.get('academic_year_id');
    const classId = req.nextUrl.searchParams.get('class_id');

    let where = 'WHERE s.school_id = ?';
    const params: any[] = [schoolId];

    if (studentId) {
      where += ' AND cr.student_id = ?';
      params.push(studentId);
    }
    if (termId) {
      where += ' AND cr.term_id = ?';
      params.push(termId);
    }
    if (academicYearId) {
      where += ' AND (cr.academic_year_id = ? OR t.academic_year_id = ?)';
      params.push(academicYearId, academicYearId);
    }
    if (classId) {
      where += ' AND cr.class_id = ?';
      params.push(classId);
    }

    const [rows]: any = await conn.execute(`
      SELECT
        cr.id,
        cr.student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        p.gender,
        p.photo_url,
        cr.class_id,
        c.name AS class_name,
        cr.subject_id,
        sub.name AS subject_name,
        sub.subject_type,
        sub.code AS subject_code,
        cr.term_id,
        t.name AS term_name,
        COALESCE(cr.academic_year_id, t.academic_year_id) AS academic_year_id,
        COALESCE(ay.name, ay2.name) AS academic_year_name,
        cr.result_type_id,
        rt.name AS result_type_name,
        rt.weight AS result_type_weight,
        cr.score,
        cr.grade,
        cr.remarks,
        st.name AS stream_name,
        ex.exam_date,
        ex.name AS exam_name
      FROM class_results cr
      JOIN students s ON cr.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN classes c ON cr.class_id = c.id
      LEFT JOIN subjects sub ON cr.subject_id = sub.id
      LEFT JOIN terms t ON cr.term_id = t.id
      LEFT JOIN academic_years ay ON cr.academic_year_id = ay.id
      LEFT JOIN academic_years ay2 ON t.academic_year_id = ay2.id
      LEFT JOIN result_types rt ON cr.result_type_id = rt.id
      LEFT JOIN enrollments e ON cr.student_id = e.student_id
        AND e.class_id = cr.class_id
        AND (e.academic_year_id = COALESCE(cr.academic_year_id, t.academic_year_id) OR e.academic_year_id IS NULL)
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN exams ex ON ex.term_id = cr.term_id AND ex.class_id = cr.class_id AND ex.subject_id = cr.subject_id
      ${where}
      ORDER BY p.last_name, p.first_name, sub.name, rt.name
    `, params);

    // Group by student for summary statistics
    const studentMap: Record<number, any> = {};
    for (const row of rows) {
      if (!studentMap[row.student_id]) {
        studentMap[row.student_id] = {
          student_id: row.student_id,
          admission_no: row.admission_no,
          first_name: row.first_name,
          last_name: row.last_name,
          gender: row.gender,
          photo_url: row.photo_url,
          class_name: row.class_name,
          stream_name: row.stream_name,
          results: [],
          total: 0,
          count: 0,
        };
      }
      studentMap[row.student_id].results.push(row);
      if (row.score != null) {
        studentMap[row.student_id].total += parseFloat(row.score);
        studentMap[row.student_id].count++;
      }
    }

    // Compute averages and sort by total for ranking
    const students = Object.values(studentMap)
      .map((s: any) => ({
        ...s,
        average: s.count > 0 ? Math.round((s.total / s.count) * 100) / 100 : 0,
      }))
      .sort((a: any, b: any) => b.total - a.total)
      .map((s: any, idx: number) => ({ ...s, position: idx + 1 }));

    return NextResponse.json({
      success: true,
      data: {
        results: rows,
        students,
        total_students: students.length,
      }
    });
  } catch (error) {
    console.error('Error fetching results by term:', error);
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
