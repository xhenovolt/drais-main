import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * Attendance Analytics API
 * Provides analytics and statistics for dashboard
 */

interface AnalyticsData {
  dailyCount: { date: string; present: number; absent: number; late: number }[];
  lateEntries: {
    name: string;
    type: string;
    time: string;
    delay_minutes: number;
  }[];
  absentStudents: { id: number; name: string; class: string }[];
  methodDistribution: { method: string; count: number }[];
  topDevices: { name: string; count: number }[];
  summary: {
    total_scans: number;
    matched_records: number;
    unmatched_records: number;
    present_today: number;
    absent_today: number;
    late_today: number;
  };
}

/**
 * GET /api/attendance/devices/analytics
 * Get attendance analytics for dashboard
 */
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
    const deviceId = searchParams.get('device_id');
    const days = parseInt(searchParams.get('days', 10) || '7');

    connection = await getConnection();

    const analytics: AnalyticsData = {
      dailyCount: [],
      lateEntries: [],
      absentStudents: [],
      methodDistribution: [],
      topDevices: [],
      summary: {
        total_scans: 0,
        matched_records: 0,
        unmatched_records: 0,
        present_today: 0,
        absent_today: 0,
        late_today: 0,
      },
    };

    // 1. Daily attendance count (last N days)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    startDate.setHours(0, 0, 0, 0);

    let query = `
      SELECT 
        DATE(attendance_date) as date,
        SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) as present,
        SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent,
        SUM(CASE WHEN status = 'late' THEN 1 ELSE 0 END) as late
      FROM daily_attendance
      WHERE school_id = ? AND attendance_date >= ?
    `;

    const params: any[] = [schoolId, startDate];

    if (deviceId) {
      query += ` AND arrival_device_id = ?`;
      params.push(deviceId);
    }

    query += ` GROUP BY DATE(attendance_date) ORDER BY date DESC`;

    const [dailyData] = await connection.execute(query, params);
    analytics.dailyCount = (dailyData as any[]).map((row: any) => ({
      date: row.date,
      present: row.present || 0,
      absent: row.absent || 0,
      late: row.late || 0,
    }));

    // 2. Late entries (today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [lateData] = await connection.execute(
      `SELECT 
        CONCAT(s.first_name, ' ', s.last_name) as name,
        'student' as type,
        da.first_arrival_time as time,
        CASE 
          WHEN ar.arrival_end_time IS NOT NULL 
          THEN TIMESTAMPDIFF(MINUTE, ar.arrival_end_time, da.first_arrival_time)
          ELSE 0
        END as delay_minutes
      FROM daily_attendance da
      JOIN students s ON da.person_id = s.id AND da.person_type = 'student'
      LEFT JOIN attendance_rules ar ON s.school_id = ar.school_id
      WHERE da.school_id = ? AND da.attendance_date = ? AND da.status = 'late'
      ORDER BY delay_minutes DESC
      LIMIT 10`,
      [schoolId, today]
    );

    analytics.lateEntries = (lateData as any[]).map((row: any) => ({
      name: row.name,
      type: row.type,
      time: row.time,
      delay_minutes: row.delay_minutes || 0,
    }));

    // 3. Absent students (today)
    const [absentData] = await connection.execute(
      `SELECT s.id, CONCAT(s.first_name, ' ', s.last_name) as name, c.class_name as class
      FROM students s
      LEFT JOIN classes c ON s.class_id = c.id
      WHERE s.school_id = ? AND s.status = 'enrolled'
      AND NOT EXISTS (
        SELECT 1 FROM daily_attendance da
        WHERE da.person_id = s.id AND da.person_type = 'student'
        AND da.attendance_date = ?
      )
      LIMIT 30`,
      [schoolId, today]
    );

    analytics.absentStudents = (absentData as any[]).map((row: any) => ({
      id: row.id,
      name: row.name,
      class: row.class || 'N/A',
    }));

    // 4. Method distribution (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [methodData] = await connection.execute(
      `SELECT 
        COALESCE(JSON_EXTRACT(al.raw_data, '$.Method'), 'Unknown') as method,
        COUNT(*) as count
      FROM attendance_logs al
      WHERE al.school_id = ? AND al.received_timestamp >= ?
      GROUP BY method
      ORDER BY count DESC`,
      [schoolId, thirtyDaysAgo]
    );

    analytics.methodDistribution = (methodData as any[]).map((row: any) => ({
      method: String(row.method),
      count: row.count || 0,
    }));

    // 5. Top devices by scan count
    const [deviceData] = await connection.execute(
      `SELECT 
        bd.device_name as name,
        COUNT(al.id) as count
      FROM attendance_logs al
      JOIN biometric_devices bd ON al.device_id = bd.id
      WHERE al.school_id = ? AND al.received_timestamp >= ?
      GROUP BY al.device_id
      ORDER BY count DESC
      LIMIT 5`,
      [schoolId, thirtyDaysAgo]
    );

    analytics.topDevices = (deviceData as any[]).map((row: any) => ({
      name: row.name,
      count: row.count || 0,
    }));

    // 6. Summary statistics
    const [summary] = await connection.execute(
      `SELECT 
        (SELECT COUNT(*) FROM attendance_logs 
         WHERE school_id = ? AND received_timestamp >= ?) as total_scans,
        (SELECT COUNT(*) FROM attendance_logs 
         WHERE school_id = ? AND processing_status = 'processed' 
         AND mapped_device_user_id IS NOT NULL
         AND received_timestamp >= ?) as matched_records,
        (SELECT COUNT(*) FROM attendance_logs 
         WHERE school_id = ? AND processing_status = 'processed' 
         AND mapped_device_user_id IS NULL
         AND received_timestamp >= ?) as unmatched_records,
        (SELECT COUNT(*) FROM daily_attendance 
         WHERE school_id = ? AND attendance_date = ? 
         AND status = 'present') as present_today,
        (SELECT COUNT(*) FROM daily_attendance 
         WHERE school_id = ? AND attendance_date = ? 
         AND status = 'absent') as absent_today,
        (SELECT COUNT(*) FROM daily_attendance 
         WHERE school_id = ? AND attendance_date = ? 
         AND status = 'late') as late_today`,
      [
        schoolId,
        thirtyDaysAgo,
        schoolId,
        thirtyDaysAgo,
        schoolId,
        thirtyDaysAgo,
        schoolId,
        today,
        schoolId,
        today,
        schoolId,
        today,
      ]
    );

    if ((summary as any[]).length > 0) {
      const summaryRow = (summary as any[])[0];
      analytics.summary = {
        total_scans: summaryRow.total_scans || 0,
        matched_records: summaryRow.matched_records || 0,
        unmatched_records: summaryRow.unmatched_records || 0,
        present_today: summaryRow.present_today || 0,
        absent_today: summaryRow.absent_today || 0,
        late_today: summaryRow.late_today || 0,
      };
    }

    return NextResponse.json({
      success: true,
      data: analytics,
    });

  } catch (error: any) {
    console.error('Analytics error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch analytics' },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}
