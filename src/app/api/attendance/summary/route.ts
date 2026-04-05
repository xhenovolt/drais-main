import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * GET /api/attendance/summary
 * Get comprehensive attendance summary for dashboard
 * 
 * Query params:
 * - date: string - specific date (YYYY-MM-DD), defaults to today
 * - period: string - daily, weekly, monthly
 * - class_id: number - filter by class
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
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const period = searchParams.get('period') || 'daily';
    const classId = searchParams.get('class_id');
    // school_id derived from session below

    connection = await getConnection();

    // Get date range based on period
    let startDate = date;
    let endDate = date;
    
    if (period === 'weekly') {
      const d = new Date(date);
      d.setDate(d.getDate() - 6);
      startDate = d.toISOString().split('T')[0];
    } else if (period === 'monthly') {
      const d = new Date(date);
      d.setDate(d.getDate() - 29);
      startDate = d.toISOString().split('T')[0];
    }

    // Base WHERE clause
    let classFilter = '';
    const params: any[] = [startDate, endDate, schoolId];
    
    if (classId) {
      classFilter = 'AND e.class_id = ?';
      params.push(classId);
    }

    // Get basic stats with gender breakdown
    const [statsResult] = await connection.execute(
      `SELECT 
        COUNT(s.id) as total_students,
        COUNT(sa.id) as total_marked,
        COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'present' THEN 1 END) as present,
        COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'absent' THEN 1 END) as absent,
        COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'late' THEN 1 END) as late,
        COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'excused' THEN 1 END) as excused,
        COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'not_marked' THEN 1 END) as not_marked,
        
        -- Male breakdown
        COUNT(CASE WHEN p.gender = 'Male' THEN 1 END) as male_total,
        COUNT(CASE WHEN p.gender = 'Male' AND COALESCE(sa.status, 'not_marked') = 'present' THEN 1 END) as male_present,
        COUNT(CASE WHEN p.gender = 'Male' AND COALESCE(sa.status, 'not_marked') = 'absent' THEN 1 END) as male_absent,
        COUNT(CASE WHEN p.gender = 'Male' AND COALESCE(sa.status, 'not_marked') = 'late' THEN 1 END) as male_late,
        
        -- Female breakdown
        COUNT(CASE WHEN p.gender = 'Female' THEN 1 END) as female_total,
        COUNT(CASE WHEN p.gender = 'Female' AND COALESCE(sa.status, 'not_marked') = 'present' THEN 1 END) as female_present,
        COUNT(CASE WHEN p.gender = 'Female' AND COALESCE(sa.status, 'not_marked') = 'absent' THEN 1 END) as female_absent,
        COUNT(CASE WHEN p.gender = 'Female' AND COALESCE(sa.status, 'not_marked') = 'late' THEN 1 END) as female_late,
        
        -- Method breakdown
        COUNT(CASE WHEN sa.method = 'biometric' THEN 1 END) as biometric_marked,
        COUNT(CASE WHEN sa.method = 'manual' THEN 1 END) as manual_marked,
        COUNT(CASE WHEN sa.method = 'hybrid' THEN 1 END) as hybrid_marked
        
      FROM students s
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN people p ON s.person_id = p.id
      LEFT JOIN student_attendance sa ON s.id = sa.student_id 
        AND sa.date BETWEEN ? AND ?
      WHERE s.school_id = ?
        AND s.status IN ('active', 'suspended', 'on_leave')
        AND s.deleted_at IS NULL
        ${classFilter}`,
      params
    );

    const stats = Array.isArray(statsResult) ? statsResult[0] : statsResult;

    // Get daily trends for the period
    const [trendsResult] = await connection.execute(
      `SELECT 
        sa.date,
        COUNT(s.id) as total_enrolled,
        COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'present' THEN 1 END) as present,
        COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'absent' THEN 1 END) as absent,
        COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'late' THEN 1 END) as late,
        ROUND(COUNT(CASE WHEN COALESCE(sa.status, 'not_marked') = 'present' THEN 1 END) * 100.0 / COUNT(s.id), 1) as attendance_rate
      FROM students s
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN student_attendance sa ON s.id = sa.student_id 
        AND sa.date BETWEEN ? AND ?
      WHERE s.school_id = ?
        AND s.status IN ('active', 'suspended', 'on_leave')
        AND s.deleted_at IS NULL
        ${classFilter}
      GROUP BY sa.date
      ORDER BY sa.date ASC`,
      params
    );

    // Get device stats (from Dahua and biometric devices)
    const [deviceStats] = await connection.execute(
      `SELECT 
        COUNT(DISTINCT dd.id) as total_devices,
        COUNT(DISTINCT CASE WHEN dd.status = 'active' THEN dd.id END) as active_devices,
        COUNT(dal.id) as total_records,
        COUNT(CASE WHEN DATE(dal.created_at) = CURDATE() THEN dal.id END) as today_records
      FROM dahua_devices dd
      LEFT JOIN dahua_attendance_logs dal ON dd.id = dal.device_id
      WHERE dd.school_id = ?`,
      [schoolId]
    );

    // Get recent activity
    const [recentActivity] = await connection.execute(
      `SELECT 
        sa.id,
        sa.student_id,
        sa.date,
        sa.status,
        sa.time_in,
        sa.method,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        c.name as class_name
      FROM student_attendance sa
      JOIN students s ON sa.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      WHERE sa.date = ?
      ORDER BY sa.marked_at DESC
      LIMIT 10`,
      [date]
    );

    // Calculate rates
    const totalStudents = parseInt(stats.total_students, 10) || 0;
    const totalMarked = parseInt(stats.total_marked, 10) || 0;
    const present = parseInt(stats.present, 10) || 0;
    const absent = parseInt(stats.absent, 10) || 0;
    const late = parseInt(stats.late, 10) || 0;
    const excused = parseInt(stats.excused, 10) || 0;
    const notMarked = parseInt(stats.not_marked, 10) || 0;

    const attendanceRate = totalStudents > 0 ? Math.round((present / totalStudents) * 100) : 0;
    const presentRate = totalMarked > 0 ? Math.round((present / totalMarked) * 100) : 0;
    const absentRate = totalMarked > 0 ? Math.round((absent / totalMarked) * 100) : 0;
    const lateRate = totalMarked > 0 ? Math.round((late / totalMarked) * 100) : 0;

    // Male rates
    const maleTotal = parseInt(stats.male_total, 10) || 0;
    const malePresent = parseInt(stats.male_present, 10) || 0;
    const maleAttendanceRate = maleTotal > 0 ? Math.round((malePresent / maleTotal) * 100) : 0;

    // Female rates
    const femaleTotal = parseInt(stats.female_total, 10) || 0;
    const femalePresent = parseInt(stats.female_present, 10) || 0;
    const femaleAttendanceRate = femaleTotal > 0 ? Math.round((femalePresent / femaleTotal) * 100) : 0;

    // Device stats
    const deviceStatsData = Array.isArray(deviceStats) ? deviceStats[0] : {};
    const totalDevices = parseInt(deviceStatsData.total_devices, 10) || 0;
    const activeDevices = parseInt(deviceStatsData.active_devices, 10) || 0;
    const todayRecords = parseInt(deviceStatsData.today_records, 10) || 0;

    return NextResponse.json({
      success: true,
      data: {
        period: {
          start: startDate,
          end: endDate,
          type: period
        },
        overview: {
          total_students: totalStudents,
          total_marked: totalMarked,
          not_marked: notMarked,
          attendance_rate: attendanceRate
        },
        status_breakdown: {
          present: {
            count: present,
            rate: presentRate
          },
          absent: {
            count: absent,
            rate: absentRate
          },
          late: {
            count: late,
            rate: lateRate
          },
          excused: {
            count: excused
          }
        },
        gender_breakdown: {
          male: {
            total: maleTotal,
            present: parseInt(stats.male_present, 10) || 0,
            absent: parseInt(stats.male_absent, 10) || 0,
            late: parseInt(stats.male_late, 10) || 0,
            attendance_rate: maleAttendanceRate
          },
          female: {
            total: femaleTotal,
            present: parseInt(stats.female_present, 10) || 0,
            absent: parseInt(stats.female_absent, 10) || 0,
            late: parseInt(stats.female_late, 10) || 0,
            attendance_rate: femaleAttendanceRate
          }
        },
        method_breakdown: {
          biometric: parseInt(stats.biometric_marked, 10) || 0,
          manual: parseInt(stats.manual_marked, 10) || 0,
          hybrid: parseInt(stats.hybrid_marked, 10) || 0
        },
        device_stats: {
          total_devices: totalDevices,
          active_devices: activeDevices,
          today_records: todayRecords
        },
        trends: trendsResult || [],
        recent_activity: recentActivity || []
      }
    });

  } catch (error: any) {
    console.error('Summary fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch attendance summary'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
