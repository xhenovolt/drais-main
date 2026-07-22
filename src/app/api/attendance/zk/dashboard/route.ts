import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getDashboardAttendanceCounts } from '@/lib/attendance/dashboard-counts';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';

/** UTC SQL instant for local midnight of `date` (+`plusDays`). */
function utcBoundary(date: string, offsetMin: number, plusDays = 0): string {
  const ms = Date.parse(`${date}T00:00:00Z`) - offsetMin * 60_000 + plusDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
}

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

    // Today's punches — CANONICAL store (attendance_raw_events), which
    // ingestion + identity matching + repairs all write to. The legacy
    // zk_attendance_logs student_id/staff_id columns are only set by the
    // retired mapping path and go stale (dashboard showed wrong numbers).
    const policy = await resolveTimePolicy(schoolId);
    const offsetMin = policy.offsetMinutes;
    const dayStart = utcBoundary(date, offsetMin, 0);
    const dayEnd = utcBoundary(date, offsetMin, 1);
    const punchStats = await query(
      `SELECT
         COUNT(*) AS total_punches,
         SUM(CASE WHEN matched = 1 THEN 1 ELSE 0 END) AS matched_punches,
         SUM(CASE WHEN matched = 0 THEN 1 ELSE 0 END) AS unmatched_punches,
         SUM(CASE WHEN matched = 1 AND role_type = 'student' THEN 1 ELSE 0 END) AS student_punches,
         SUM(CASE WHEN matched = 1 AND role_type = 'staff' THEN 1 ELSE 0 END) AS staff_punches,
         COUNT(DISTINCT CASE WHEN matched = 1 AND role_type = 'student' THEN role_ref_id END) AS unique_students_present,
         COUNT(DISTINCT CASE WHEN matched = 1 AND role_type = 'staff' THEN role_ref_id END) AS unique_staff_present,
         COUNT(DISTINCT device_user_id) AS unique_users
       FROM attendance_raw_events
       WHERE school_id = ? AND punch_at >= ? AND punch_at < ?`,
      [schoolId, dayStart, dayEnd],
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

    // Hourly breakdown for chart — school-local hours from UTC instants.
    const hourlyData = await query(
      `SELECT
         HOUR(DATE_ADD(punch_at, INTERVAL ? MINUTE)) AS hour,
         COUNT(*) AS punches,
         SUM(CASE WHEN io_mode = 0 THEN 1 ELSE 0 END) AS check_ins,
         SUM(CASE WHEN io_mode = 1 THEN 1 ELSE 0 END) AS check_outs
       FROM attendance_raw_events
       WHERE school_id = ? AND punch_at >= ? AND punch_at < ?
       GROUP BY HOUR(DATE_ADD(punch_at, INTERVAL ? MINUTE))
       ORDER BY hour`,
      [offsetMin, schoolId, dayStart, dayEnd, offsetMin],
    );

    // Recent punches (live feed) — canonical store; aliases preserved so
    // the frontend keeps working (student_/staff_ names from people via
    // person_id, ids from role_ref_id per role).
    const recentPunches = await query(
      `SELECT
         ar.id, ar.device_sn, CAST(ar.device_user_id AS CHAR) AS device_user_id,
         ar.punch_at AS check_time,
         ar.verify_type, ar.io_mode, ar.matched,
         CASE WHEN ar.role_type = 'student' THEN ar.role_ref_id END AS student_id,
         CASE WHEN ar.role_type = 'staff'   THEN ar.role_ref_id END AS staff_id,
         d.device_name, d.location,
         CASE WHEN ar.role_type = 'student' THEN p.first_name END AS student_first_name,
         CASE WHEN ar.role_type = 'student' THEN p.last_name  END AS student_last_name,
         CASE WHEN ar.role_type = 'staff'   THEN p.first_name END AS staff_first_name,
         CASE WHEN ar.role_type = 'staff'   THEN p.last_name  END AS staff_last_name,
         COALESCE(ar.display_name, dud.device_name) AS device_known_name
       FROM attendance_raw_events ar
       LEFT JOIN devices d ON ar.device_sn = d.sn
       LEFT JOIN people p ON ar.person_id = p.id
       LEFT JOIN device_user_directory dud
         ON dud.school_id = ar.school_id
        AND dud.device_sn = ar.device_sn
        AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
       WHERE ar.school_id = ?
       ORDER BY ar.punch_at DESC
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

    const punch = punchStats[0] || {};

    // Present / late / absent derived from raw punches + the school's
    // attendance rule (reliable even when the canonical engine table is
    // sparse). Replaces the old "distinct matched student" present count
    // that ignored late and never produced absent.
    const counts = await getDashboardAttendanceCounts(schoolId, date);
    const totalStudents = counts.students.total || Number(studentCount[0]?.total || 0);
    const totalStaff = counts.staff.total || Number(staffCount[0]?.total || 0);

    return NextResponse.json({
      success: true,
      data: {
        date,
        devices: deviceStats[0] || {},
        students: {
          total: totalStudents,
          present: counts.students.present,
          late: counts.students.late,
          absent: counts.students.absent,
          rate: totalStudents > 0 ? Math.round((counts.students.present / totalStudents) * 100) : null,
        },
        staff: {
          total: totalStaff,
          present: counts.staff.present,
          late: counts.staff.late,
          absent: counts.staff.absent,
          rate: totalStaff > 0 ? Math.round((counts.staff.present / totalStaff) * 100) : null,
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
