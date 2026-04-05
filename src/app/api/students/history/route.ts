import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const studentId = searchParams.get('student_id');

    connection = await getConnection();

    // Get academic history from class_results
    let sql = `
      SELECT 
        cr.id,
        cr.student_id,
        cr.class_id,
        cr.subject_id,
        cr.term_id,
        cr.score,
        cr.grade,
        cr.remarks,
        cr.created_at,
        p.first_name,
        p.last_name,
        s.admission_no,
        c.name as class_name,
        sub.name as subject_name,
        sub.code as subject_code,
        t.name as term_name,
        rt.name as result_type_name,
        ay.name as academic_year
      FROM class_results cr
      JOIN students s ON cr.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN classes c ON cr.class_id = c.id
      LEFT JOIN subjects sub ON cr.subject_id = sub.id
      LEFT JOIN terms t ON cr.term_id = t.id
      LEFT JOIN result_types rt ON cr.result_type_id = rt.id
      LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
      WHERE s.school_id = ?
    `;

    const params = [schoolId];

    if (studentId) {
      sql += ' AND cr.student_id = ?';
      params.push(parseInt(studentId, 10));
    }

    sql += ' ORDER BY COALESCE(p.last_name, \'\') ASC, COALESCE(p.first_name, \'\') ASC, t.name DESC, sub.name';

    const [academicRows] = await connection.execute(sql, params);

    // Get student history details
    let historySQL = `
      SELECT 
        sh.id,
        sh.student_id,
        sh.no_of_juzus_memorized,
        sh.previous_school,
        sh.previous_school_year,
        sh.previous_class_theology,
        sh.previous_class_secular,
        p.first_name,
        p.last_name,
        s.admission_no
      FROM student_history sh
      JOIN students s ON sh.student_id = s.id
      JOIN people p ON s.person_id = p.id
      WHERE s.school_id = ?
    `;

    const historyParams = [schoolId];

    if (studentId) {
      historySQL += ' AND sh.student_id = ?';
      historyParams.push(parseInt(studentId, 10));
    }

    const [historyRows] = await connection.execute(historySQL, historyParams);

    // Get enrollment history (for lifecycle tracking)
    let enrollmentSQL = `
      SELECT
        e.id AS enrollment_id,
        e.student_id,
        c.id AS class_id,
        c.name AS class_name,
        c.level AS class_level,
        st.name AS stream_name,
        ay.id AS academic_year_id,
        ay.name AS academic_year_name,
        t.name AS term_name,
        e.status AS enrollment_status,
        e.enrollment_date,
        e.end_date,
        e.end_reason
      FROM enrollments e
      JOIN students s ON e.student_id = s.id
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      LEFT JOIN terms t ON e.term_id = t.id
      WHERE s.school_id = ?
    `;
    const enrollParams: any[] = [schoolId];

    if (studentId) {
      enrollmentSQL += ' AND e.student_id = ?';
      enrollParams.push(parseInt(studentId, 10));
    }

    enrollmentSQL += ' ORDER BY ay.start_date DESC, e.id DESC';

    const [enrollmentRows] = await connection.execute(enrollmentSQL, enrollParams);

    return NextResponse.json({
      success: true,
      data: {
        academic_results: academicRows,
        student_history: historyRows,
        enrollment_history: enrollmentRows
      }
    });

  } catch (error: any) {
    console.error('Academic history fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch academic history'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
