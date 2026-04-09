import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/zk/dashboard
 * Returns real-time stats for the ZK attendance dashboard.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { schoolId } = session;
  const url = new URL(req.url);
  const date = url.searchParams.get('date') || new Date().toISOString().split('T')[0];

  try {
    // Device stats (school-scoped)
    const deviceStats = await query(
      `SELECT
         COUNT(*) AS total_devices,
         SUM(CASE WHEN status = 'active' AND last_seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 1 ELSE 0 END) AS online_devices,
         SUM(CASE WHEN status = 'active' AND (last_seen IS NULL OR last_seen <= DATE_SUB(NOW(), INTERVAL 5 MINUTE)) THEN 1 ELSE 0 END) AS offline_devices,
         SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance_devices
       FROM devices
       WHERE school_id = ?`,
      [schoolId],
    );

    // Total students (school-scoped for accuracy)
    const studentCount = await query(
      `SELECT COUNT(*) AS total FROM students WHERE school_id = ? AND status = 'active'`,
      [schoolId],
    );

    // Total staff (school-scoped)
    const staffCount = await query(
      `SELECT COUNT(*) AS total FROM staff WHERE school_id = ? AND status = 'active'`,
      [schoolId],
    );

    // Today's punches (school-scoped)
    const punchStats = await query(
      `SELECT
         COUNT(*) AS total_punches,
         SUM(CASE WHEN matched = 1 THEN 1 ELSE 0 END) AS matched_punches,
         SUM(CASE WHEN matched = 0 THEN 1 ELSE 0 END) AS unmatched_punches,
         SUM(CASE WHEN student_id IS NOT NULL THEN 1 ELSE 0 END) AS student_punches,
         SUM(CASE WHEN staff_id IS NOT NULL THEN 1 ELSE 0 END) AS staff_punches,
         COUNT(DISTINCT CASE WHEN student_id IS NOT NULL THEN student_id END) AS unique_students_present,
         COUNT(DISTINCT CASE WHEN staff_id IS NOT NULL THEN staff_id END) AS unique_staff_present,
         COUNT(DISTINCT device_user_id) AS unique_users
       FROM zk_attendance_logs
       WHERE school_id = ? AND DATE(check_time) = ?`,
      [schoolId, date],
    );

    // Pending commands (school-scoped)
    const commandStats = await query(
      `SELECT
         COUNT(*) AS total_pending,
         SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
       FROM zk_device_commands
       WHERE school_id = ? AND status IN ('pending', 'sent', 'failed')`,
      [schoolId],
    );

    // Hourly breakdown for chart (school-scoped)
    const hourlyData = await query(
      `SELECT
         HOUR(check_time) AS hour,
         COUNT(*) AS punches,
         SUM(CASE WHEN io_mode = 0 THEN 1 ELSE 0 END) AS check_ins,
         SUM(CASE WHEN io_mode = 1 THEN 1 ELSE 0 END) AS check_outs
       FROM zk_attendance_logs
       WHERE school_id = ? AND DATE(check_time) = ?
       GROUP BY HOUR(check_time)
       ORDER BY hour`,
      [schoolId, date],
    );

    // Recent punches (live feed, school-scoped)
    const recentPunches = await query(
      `SELECT
         al.id, al.device_sn, al.device_user_id, al.check_time,
         al.verify_type, al.io_mode, al.matched,
         al.student_id, al.staff_id,
         d.device_name, d.location,
         sp.first_name AS student_first_name,
         sp.last_name AS student_last_name,
         stf.first_name AS staff_first_name,
         stf.last_name AS staff_last_name
       FROM zk_attendance_logs al
       LEFT JOIN devices d ON al.device_sn = d.sn
       LEFT JOIN students st ON al.student_id = st.id
       LEFT JOIN people sp ON st.person_id = sp.id
       LEFT JOIN staff stf ON al.staff_id = stf.id
       WHERE al.school_id = ?
       ORDER BY al.check_time DESC
       LIMIT 20`,
      [schoolId],
    );

    // Devices with last heartbeat (school-scoped)
    const devices = await query(
      `SELECT
         id, sn AS serial_number, device_name, location, ip_address, status,
         last_seen AS last_heartbeat, last_activity,
         CASE
           WHEN last_seen > DATE_SUB(NOW(), INTERVAL 2 MINUTE) THEN 'online'
           WHEN last_seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'delayed'
           ELSE 'offline'
         END AS connection_status
       FROM devices
       WHERE school_id = ?
       ORDER BY last_seen DESC`,
      [schoolId],
    );

    const totalStudents = Number(studentCount[0]?.total || 0);
    const totalStaff = Number(staffCount[0]?.total || 0);
    const punch = punchStats[0] || {};
    const uniqueStudentsPresent = Number(punch.unique_students_present || 0);
    const uniqueStaffPresent = Number(punch.unique_staff_present || 0);

    return NextResponse.json({
      success: true,
      data: {
        date,
        devices: deviceStats[0] || {},
        students: {
          total: totalStudents,
          present: uniqueStudentsPresent,
          rate: totalStudents > 0 ? Math.round((uniqueStudentsPresent / totalStudents) * 100) : null,
        },
        staff: {
          total: totalStaff,
          present: uniqueStaffPresent,
          rate: totalStaff > 0 ? Math.round((uniqueStaffPresent / totalStaff) * 100) : null,
        },
        punches: punch,
        commands: commandStats[0] || {},
        hourly: hourlyData,
        recentPunches,
        deviceList: devices,
      },
    });
  } catch (err) {
    console.error('[ZK Dashboard] Error:', err);
    return NextResponse.json(
      { error: 'Failed to load dashboard data' },
      { status: 500 },
    );
  }
}
