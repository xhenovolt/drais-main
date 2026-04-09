import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/admin/biometric-monitor
 * Live biometric data for the monitor dashboard.
 * Returns: devices (with heartbeat recency), recent logs, command queue stats.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const schoolId = session.schoolId;

  try {
    // 1. All devices with live status + per-school hidden flag
    const devices = await query(
      `SELECT
         d.id, d.sn, d.device_name, d.ip_address, d.last_seen, d.status,
         d.is_online,
         CASE
           WHEN d.last_seen > DATE_SUB(NOW(), INTERVAL 2 MINUTE) THEN 'online'
           ELSE 'offline'
         END AS live_status,
         TIMESTAMPDIFF(SECOND, d.last_seen, NOW()) AS seconds_ago,
         (SELECT COUNT(*) FROM zk_attendance_logs al
          WHERE al.device_sn = d.sn AND al.check_time > DATE_SUB(NOW(), INTERVAL 1 HOUR)) AS punches_1h,
         CASE WHEN h.id IS NOT NULL THEN 1 ELSE 0 END AS is_hidden
       FROM devices d
       LEFT JOIN device_school_hidden h ON h.device_id = d.id AND h.school_id = ?
       WHERE d.deleted_at IS NULL
       ORDER BY d.last_seen DESC`,
      [schoolId],
    );

    // 2. Last 50 attendance events (real-time feed)
    const recentLogs = await query(
      `SELECT
         al.id, al.device_sn, al.device_user_id, al.check_time,
         al.verify_type, al.io_mode, al.matched, al.student_id, al.staff_id,
         COALESCE(
           CONCAT(p.first_name, ' ', p.last_name),
           CONCAT(sp.first_name, ' ', sp.last_name),
           CONCAT('PIN ', al.device_user_id)
         ) AS person_name,
         CASE
           WHEN al.student_id IS NOT NULL THEN 'student'
           WHEN al.staff_id IS NOT NULL THEN 'staff'
           ELSE 'unmatched'
         END AS match_type,
         d.device_name
       FROM zk_attendance_logs al
       LEFT JOIN students s ON al.student_id = s.id
       LEFT JOIN people p ON s.person_id = p.id
       LEFT JOIN staff st ON al.staff_id = st.id
       LEFT JOIN people sp ON st.person_id = sp.id
       LEFT JOIN devices d ON d.sn = al.device_sn
       ORDER BY al.check_time DESC
       LIMIT 50`,
      [],
    );

    // 3. Recent heartbeats (last 20)
    const heartbeats = await query(
      `SELECT sn, ip, push_version, created_at
       FROM device_heartbeats
       ORDER BY created_at DESC
       LIMIT 20`,
      [],
    );

    // 4. Command queue summary
    const commandStats = await query(
      `SELECT
         status,
         COUNT(*) AS count
       FROM zk_device_commands
       GROUP BY status`,
      [],
    );

    return NextResponse.json({
      success: true,
      devices,
      recent_logs: recentLogs,
      heartbeats,
      command_stats: commandStats,
    });
  } catch (err) {
    console.error('[Biometric Monitor] Error:', err);
    return NextResponse.json({ error: 'Failed to load monitor data' }, { status: 500 });
  }
}
