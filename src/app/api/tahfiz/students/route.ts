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
    const status = searchParams.get('status');
    const group = searchParams.get('group');
    const search = searchParams.get('search');

    connection = await getConnection();

    let sql = `
      SELECT 
        CONCAT(p.first_name, ' ', p.last_name, COALESCE(CONCAT(' ', p.other_name), '')) as name,
        p.first_name,
        p.last_name,
        p.other_name,
        p.gender,
        p.photo_url as avatar,
        s.admission_no,
        s.status,
        c.name as class_name,
        str.name as stream_name,
        tc.name as theology_class_name,
        cur.name as curriculum_name,
        cur.code as curriculum_code,
        tg.name as group_name,
        tg.id as group_id,
        CONCAT(tp.first_name, ' ', tp.last_name) as teacher_name,
        
        -- Tahfiz Progress Metrics
        COALESCE(portion_stats.total_portions, 0) as total_portions,
        COALESCE(portion_stats.completed_portions, 0) as completed_portions,
        COALESCE(record_stats.total_presentations, 0) as total_presentations,
        COALESCE(record_stats.avg_retention_score, 0) as avg_retention_score,
        COALESCE(record_stats.avg_marks, 0) as avg_marks,
        
        -- Attendance Metrics
        COALESCE(attendance_stats.attendance_records, 0) as attendance_records,
        COALESCE(attendance_stats.present_days, 0) as present_days,
        CASE 
          WHEN COALESCE(attendance_stats.attendance_records, 0) > 0 
          THEN ROUND((COALESCE(attendance_stats.present_days, 0) * 100.0) / attendance_stats.attendance_records, 1)
          ELSE 0 
        END as attendance_rate,
        
        -- Progress Calculations
        CASE 
          WHEN COALESCE(portion_stats.total_portions, 0) > 0 
          THEN ROUND((COALESCE(portion_stats.completed_portions, 0) * 100.0) / portion_stats.total_portions, 1)
          ELSE 0 
        END as completion_rate,
        
        -- Recent Activity
        record_stats.last_session,
        e.created_at as enrollment_date,
        
        -- Verse Counting (estimated)
        COALESCE(portion_stats.total_verses, 0) as total_verses,
        COALESCE(portion_stats.completed_verses, 0) as completed_verses
        
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams str ON e.stream_id = str.id
      LEFT JOIN classes tc ON e.theology_class_id = tc.id
      LEFT JOIN curriculums cur ON c.curriculum_id = cur.id
      LEFT JOIN tahfiz_group_members tgm ON s.id = tgm.student_id
      LEFT JOIN tahfiz_groups tg ON tgm.group_id = tg.id
      LEFT JOIN staff st ON tg.teacher_id = st.id
      LEFT JOIN people tp ON st.person_id = tp.id
      
      -- Portion Statistics
      LEFT JOIN (
        SELECT 
          student_id,
          COUNT(*) as total_portions,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_portions,
          SUM(COALESCE(ayah_to - ayah_from + 1, estimated_days * 10)) as total_verses,
          SUM(CASE WHEN status = 'completed' THEN COALESCE(ayah_to - ayah_from + 1, estimated_days * 10) ELSE 0 END) as completed_verses
        FROM tahfiz_portions 
        GROUP BY student_id
      ) portion_stats ON s.id = portion_stats.student_id
      
      -- Record Statistics
      LEFT JOIN (
        SELECT 
          student_id,
          COUNT(*) as total_presentations,
          AVG(retention_score) as avg_retention_score,
          AVG(mark) as avg_marks,
          MAX(recorded_at) as last_session
        FROM tahfiz_records 
        WHERE presented = 1
        GROUP BY student_id
      ) record_stats ON s.id = record_stats.student_id
      
      -- Attendance Statistics
      LEFT JOIN (
        SELECT 
          student_id,
          COUNT(*) as attendance_records,
          SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present_days
        FROM tahfiz_attendance 
        GROUP BY student_id
      ) attendance_stats ON s.id = attendance_stats.student_id
      
      WHERE s.school_id = ?
      AND (e.theology_class_id IS NOT NULL OR tgm.student_id IS NOT NULL)
    `;

    const params: any[] = [schoolId];

    // Add filters
    if (status && status !== 'all') {
      sql += ' AND s.status = ?';
      params.push(status);
    }

    if (group && group !== 'all') {
      if (group === 'no_group') {
        sql += ' AND tg.name IS NULL';
      } else {
        sql += ' AND tg.name = ?';
        params.push(group);
      }
    }

    if (search) {
      sql += ` AND (
        CONCAT(p.first_name, ' ', p.last_name, COALESCE(CONCAT(' ', p.other_name), '')) LIKE ? 
        OR s.admission_no LIKE ?
      )`;
      params.push(`%${search}%`, `%${search}%`);
    }

    // IMPORTANT: Sort alphabetically by full name
    sql += ' ORDER BY p.first_name ASC, p.last_name ASC, p.other_name ASC';

    const [students] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: students
    });

  } catch (error: any) {
    console.error('Tahfiz students fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch Tahfiz students'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}