import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(request: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(request.url);
    // school_id derived from session below
    const termId = searchParams.get('term_id');
    const classId = searchParams.get('class_id');
    const groupId = searchParams.get('group_id');
    const studentId = searchParams.get('student_id');

    connection = await getConnection();

    // Build comprehensive query to get all Tahfiz data
    let baseQuery = `
      SELECT DISTINCT
        -- Student info
        s.id as student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        p.gender,
        p.photo_url,
        
        -- Class info
        c.name as class_name,
        st.name as stream_name,
        
        -- Group info
        tg.id as group_id,
        tg.name as group_name,
        CONCAT(tp.first_name, ' ', tp.last_name) as teacher_name,
        
        -- Tahfiz progress
        COUNT(DISTINCT tr.id) as total_records,
        COUNT(DISTINCT CASE WHEN tr.status = 'completed' THEN tr.id END) as completed_portions,
        AVG(CASE WHEN tr.retention_score IS NOT NULL THEN tr.retention_score END) as avg_retention_score,
        AVG(CASE WHEN tr.mark IS NOT NULL THEN tr.mark END) as avg_marks,
        COUNT(DISTINCT CASE WHEN tr.presented = 1 THEN tr.id END) as presentations_made,
        
        -- Evaluations
        AVG(te.retention_score) as eval_retention_score,
        AVG(te.tajweed_score) as eval_tajweed_score,
        AVG(te.voice_score) as eval_voice_score,
        AVG(te.discipline_score) as eval_discipline_score,
        
        -- Attendance
        COUNT(DISTINCT ta.id) as total_attendance_records,
        COUNT(DISTINCT CASE WHEN ta.status = 'present' THEN ta.id END) as present_days,
        
        -- Portions info
        COUNT(DISTINCT tpo.id) as total_portions_assigned,
        COUNT(DISTINCT CASE WHEN tpo.status = 'completed' THEN tpo.id END) as portions_completed,
        COUNT(DISTINCT CASE WHEN tpo.status = 'in_progress' THEN tpo.id END) as portions_in_progress,
        
        -- Books info
        GROUP_CONCAT(DISTINCT tb.title) as books_studied,
        
        -- Term info
        t.name as term_name,
        ay.name as academic_year

      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id AND c.name = 'tahfiz'
      LEFT JOIN streams st ON e.stream_id = st.id
      LEFT JOIN terms t ON e.term_id = t.id
      LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
      
      -- Tahfiz specific joins
      LEFT JOIN tahfiz_group_members tgm ON s.id = tgm.student_id
      LEFT JOIN tahfiz_groups tg ON tgm.group_id = tg.id
      LEFT JOIN staff staff ON tg.teacher_id = staff.id
      LEFT JOIN people tp ON staff.person_id = tp.id
      
      LEFT JOIN tahfiz_records tr ON s.id = tr.student_id
      LEFT JOIN tahfiz_plans tpl ON tr.plan_id = tpl.id
      LEFT JOIN tahfiz_books tb ON tpl.book_id = tb.id
      
      LEFT JOIN tahfiz_evaluations te ON s.id = te.student_id
      LEFT JOIN tahfiz_attendance ta ON s.id = ta.student_id
      LEFT JOIN tahfiz_portions tpo ON s.id = tpo.student_id
      
      WHERE s.school_id = ?
      AND s.status = 'active'
      AND c.id IS NOT NULL
    `;

    const params = [schoolId];

    // Add filters
    if (termId) {
      baseQuery += ' AND t.id = ?';
      params.push(termId);
    }
    if (classId) {
      baseQuery += ' AND c.id = ?';
      params.push(classId);
    }
    if (groupId) {
      baseQuery += ' AND tg.id = ?';
      params.push(groupId);
    }
    if (studentId) {
      baseQuery += ' AND s.id = ?';
      params.push(studentId);
    }

    baseQuery += `
      GROUP BY s.id, p.first_name, p.last_name, p.gender, p.photo_url, 
               s.admission_no, c.name, st.name, tg.id, tg.name, 
               tp.first_name, tp.last_name, t.name, ay.name
      ORDER BY p.first_name, p.last_name
    `;

    const [students] = await connection.execute(baseQuery, params);

    // Get detailed records for each student
    const detailedResults = [];
    for (const student of students as any[]) {
      // Get detailed tahfiz records
      const [records] = await connection.execute(`
        SELECT 
          tr.*,
          tpl.portion_text,
          tpl.type as plan_type,
          tpl.assigned_date,
          tb.title as book_title,
          tg.name as group_name
        FROM tahfiz_records tr
        LEFT JOIN tahfiz_plans tpl ON tr.plan_id = tpl.id
        LEFT JOIN tahfiz_books tb ON tpl.book_id = tb.id
        LEFT JOIN tahfiz_groups tg ON tr.group_id = tg.id
        WHERE tr.student_id = ?
        ORDER BY tr.recorded_at DESC
      `, [student.student_id]);

      // Get evaluations
      const [evaluations] = await connection.execute(`
        SELECT * FROM tahfiz_evaluations 
        WHERE student_id = ?
        ORDER BY evaluated_at DESC
      `, [student.student_id]);

      // Get portions
      const [portions] = await connection.execute(`
        SELECT * FROM tahfiz_portions 
        WHERE student_id = ?
        ORDER BY assigned_at DESC
      `, [student.student_id]);

      // Get attendance
      const [attendance] = await connection.execute(`
        SELECT * FROM tahfiz_attendance 
        WHERE student_id = ?
        ORDER BY date DESC
        LIMIT 30
      `, [student.student_id]);

      detailedResults.push({
        ...student,
        records: records,
        evaluations: evaluations,
        portions: portions,
        attendance: attendance
      });
    }

    return NextResponse.json({
      success: true,
      data: detailedResults,
      summary: {
        total_students: detailedResults.length,
        total_groups: [...new Set(detailedResults.map((s: any) => s.group_id).filter(Boolean))].length,
        avg_retention: detailedResults.reduce((sum: number, s: any) => sum + (s.avg_retention_score || 0), 0) / detailedResults.length,
        avg_marks: detailedResults.reduce((sum: number, s: any) => sum + (s.avg_marks || 0), 0) / detailedResults.length
      }
    });

  } catch (error) {
    console.error('Error fetching Tahfiz reports:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch Tahfiz reports',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}
