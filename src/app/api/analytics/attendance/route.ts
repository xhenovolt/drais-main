import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const days = parseInt(searchParams.get('days', 10) || '30');
    
    const connection = await getConnection();
    
    // Student attendance trends
    const studentAttendanceTrends = await connection.execute(`
      SELECT 
        sa.date as attendance_date,
        c.name as class_name,
        COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present_count,
        COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent_count,
        COUNT(sa.id) as total_marked,
        ROUND(COUNT(CASE WHEN sa.status = 'present' THEN 1 END) / NULLIF(COUNT(sa.id), 0) * 100, 2) as attendance_rate
      FROM student_attendance sa
      JOIN students s ON sa.student_id = s.id AND s.deleted_at IS NULL
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      WHERE s.school_id = ? 
      AND sa.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY sa.date, c.id, c.name
      ORDER BY attendance_date DESC, c.name
    `, [schoolId, days]);

    // Chronic absentees (students with poor attendance)
    const chronicAbsentees = await connection.execute(`
      SELECT 
        s.id as student_id,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        s.admission_no,
        c.name as class_name,
        COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present_days,
        COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent_days,
        COUNT(sa.id) as total_days,
        ROUND(COUNT(CASE WHEN sa.status = 'present' THEN 1 END) / NULLIF(COUNT(sa.id), 0) * 100, 2) as attendance_rate,
        MAX(sa.date) as last_present_date
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      LEFT JOIN student_attendance sa ON s.id = sa.student_id 
        AND sa.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      GROUP BY s.id, p.first_name, p.last_name, s.admission_no, c.name
      HAVING attendance_rate < 80 OR absent_days > 5
      ORDER BY attendance_rate ASC, absent_days DESC
    `, [days, schoolId]);

    // Staff attendance summary
    const staffAttendanceSummary = await connection.execute(`
      SELECT 
        st.id as staff_id,
        CONCAT(p.first_name, ' ', p.last_name) as staff_name,
        st.position,
        COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present_days,
        COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent_days,
        COUNT(sa.id) as total_days,
        ROUND(COUNT(CASE WHEN sa.status = 'present' THEN 1 END) / NULLIF(COUNT(sa.id), 0) * 100, 2) as attendance_rate
      FROM staff st
      JOIN people p ON st.person_id = p.id AND p.deleted_at IS NULL
      LEFT JOIN staff_attendance sa ON st.id = sa.staff_id 
        AND sa.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      WHERE st.school_id = ? AND st.status = 'active'
      GROUP BY st.id, p.first_name, p.last_name, st.position
      ORDER BY attendance_rate DESC
    `, [days, schoolId]);

    // Daily attendance overview
    const dailyOverview = await connection.execute(`
      SELECT 
        sa.date as date,
        'student' as type,
        COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present,
        COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent,
        COUNT(sa.id) as total
      FROM student_attendance sa
      JOIN students s ON sa.student_id = s.id AND s.deleted_at IS NULL
      WHERE s.school_id = ? 
      AND sa.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY sa.date
      
      UNION ALL
      
      SELECT 
        sa.date as date,
        'staff' as type,
        COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present,
        COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent,
        COUNT(sa.id) as total
      FROM staff_attendance sa
      JOIN staff st ON sa.staff_id = st.id
      WHERE st.school_id = ?
      AND sa.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY sa.date
      
      ORDER BY date DESC, type
    `, [schoolId, days, schoolId, days]);

    // Attendance correlation with performance
    const attendancePerformanceCorrelation = await connection.execute(`
      SELECT 
        s.id as student_id,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        c.name as class_name,
        ROUND(COUNT(CASE WHEN sa.status = 'present' THEN 1 END) / NULLIF(COUNT(sa.id), 0) * 100, 2) as attendance_rate,
        AVG(cr.score) as avg_performance,
        COUNT(cr.id) as subject_count
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      LEFT JOIN student_attendance sa ON s.id = sa.student_id 
        AND sa.date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      LEFT JOIN class_results cr ON s.id = cr.student_id
      WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      GROUP BY s.id, p.first_name, p.last_name, c.name
      HAVING subject_count > 0
      ORDER BY attendance_rate DESC, avg_performance DESC
    `, [days, schoolId]);

    await connection.end();

    return NextResponse.json({
      success: true,
      data: {
        studentAttendanceTrends: studentAttendanceTrends[0],
        chronicAbsentees: chronicAbsentees[0],
        staffAttendanceSummary: staffAttendanceSummary[0],
        dailyOverview: dailyOverview[0],
        attendancePerformanceCorrelation: attendancePerformanceCorrelation[0]
      }
    });
  } catch (error: any) {
    console.error('Error fetching attendance analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
