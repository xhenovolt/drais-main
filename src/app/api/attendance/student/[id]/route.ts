import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/attendance/student/[id]
 * Fetch student attendance history
 * 
 * Query params:
 * - start_date: string - start date (YYYY-MM-DD)
 * - end_date: string - end date (YYYY-MM-DD)
 * - limit: number - number of records to return
 */
export async function GET(req: NextRequest, { params }: RouteParams) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const { id } = await params;
    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const limit = parseInt(searchParams.get('limit', 10) || '50', 10);

    // Default to last 30 days if no dates provided
    const today = new Date().toISOString().split('T')[0];
    const defaultStartDate = new Date();
    defaultStartDate.setDate(defaultStartDate.getDate() - 30);
    
    const queryStartDate = startDate || defaultStartDate.toISOString().split('T')[0];
    const queryEndDate = endDate || today;

    connection = await getConnection();

    // Get student details
    const [students] = await connection.execute(
      `SELECT 
        s.id,
        s.admission_number,
        p.first_name,
        p.last_name,
        p.other_name,
        p.gender,
        p.date_of_birth,
        c.class_name,
        st.stream_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN streams st ON e.stream_id = st.id
      WHERE s.id = ?`,
      [id]
    );

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Student not found'
      }, { status: 404 });
    }

    const student = students[0];

    // Get attendance records
    const [records] = await connection.execute(
      `SELECT 
        sa.id,
        sa.date,
        sa.status,
        sa.time_in,
        sa.time_out,
        sa.method,
        sa.device_id,
        sa.notes,
        sa.marked_at,
        dd.device_name,
        dd.ip_address as device_ip
      FROM student_attendance sa
      LEFT JOIN dahua_devices dd ON sa.device_id = dd.id
      WHERE sa.student_id = ?
        AND sa.date BETWEEN ? AND ?
      ORDER BY sa.date DESC, sa.time_in DESC
      LIMIT ?`,
      [id, queryStartDate, queryEndDate, limit]
    );

    // Get attendance statistics for the period
    const [statsResult] = await connection.execute(
      `SELECT 
        COUNT(sa.id) as total_records,
        COUNT(CASE WHEN sa.status = 'present' THEN 1 END) as present,
        COUNT(CASE WHEN sa.status = 'absent' THEN 1 END) as absent,
        COUNT(CASE WHEN sa.status = 'late' THEN 1 END) as late,
        COUNT(CASE WHEN sa.status = 'excused' THEN 1 END) as excused,
        COUNT(DISTINCT sa.date) as days_present,
        COUNT(DISTINCT CASE WHEN sa.status IN ('present', 'late') THEN sa.date END) as days_marked
      FROM student_attendance sa
      WHERE sa.student_id = ?
        AND sa.date BETWEEN ? AND ?`,
      [id, queryStartDate, queryEndDate]
    );

    const stats = Array.isArray(statsResult) ? statsResult[0] : statsResult;
    const totalRecords = parseInt(stats.total_records, 10) || 0;
    const present = parseInt(stats.present, 10) || 0;
    const daysMarked = parseInt(stats.days_marked, 10) || 0;

    // Calculate attendance rate
    const daysInPeriod = Math.ceil(
      (new Date(queryEndDate).getTime() - new Date(queryStartDate).getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

    const attendanceRate = daysInPeriod > 0 
      ? Math.round((daysMarked / daysInPeriod) * 100) 
      : 0;

    // Get daily attendance for charts
    const [dailyData] = await connection.execute(
      `SELECT 
        sa.date,
        sa.status,
        sa.time_in,
        sa.method
      FROM student_attendance sa
      WHERE sa.student_id = ?
        AND sa.date BETWEEN ? AND ?
      ORDER BY sa.date ASC`,
      [id, queryStartDate, queryEndDate]
    );

    // Get recent biometric events
    const [biometricEvents] = await connection.execute(
      `SELECT 
        dal.id,
        dal.event_time,
        dal.event_type,
        dal.method,
        dal.card_no,
        dal.status as log_status
      FROM dahua_attendance_logs dal
      WHERE dal.student_id = ?
      ORDER BY dal.event_time DESC
      LIMIT 10`,
      [id]
    );

    return NextResponse.json({
      success: true,
      data: {
        student: {
          id: student.id,
          admission_number: student.admission_number,
          name: `${student.first_name} ${student.last_name} ${student.other_name || ''}`.trim(),
          gender: student.gender,
          date_of_birth: student.date_of_birth,
          class: student.class_name,
          stream: student.stream_name
        },
        period: {
          start: queryStartDate,
          end: queryEndDate,
          days: daysInPeriod
        },
        statistics: {
          total_records: totalRecords,
          present: present,
          absent: parseInt(stats.absent, 10) || 0,
          late: parseInt(stats.late, 10) || 0,
          excused: parseInt(stats.excused, 10) || 0,
          days_present: parseInt(stats.days_present, 10) || 0,
          days_marked: daysMarked,
          attendance_rate: attendanceRate
        },
        records: records || [],
        daily_data: dailyData || [],
        biometric_events: biometricEvents || []
      }
    });

  } catch (error: any) {
    console.error('Student attendance fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch student attendance'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
