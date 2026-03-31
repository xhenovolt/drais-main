import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/zk/reports
 * Generate attendance reports from ZK data.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { schoolId } = session;
  const url = new URL(req.url);
  const reportType = url.searchParams.get('type') || 'daily';
  const dateFrom = url.searchParams.get('date_from') || new Date().toISOString().split('T')[0];
  const dateTo = url.searchParams.get('date_to') || dateFrom;
  const deviceSn = url.searchParams.get('device_sn');

  try {
    let data: any[] = [];

    if (reportType === 'daily') {
      // Daily summary per device
      const conditions = ['al.school_id = ?', 'DATE(al.check_time) BETWEEN ? AND ?'];
      const params: any[] = [schoolId, dateFrom, dateTo];

      if (deviceSn) {
        conditions.push('al.device_sn = ?');
        params.push(deviceSn);
      }

      data = await query(
        `SELECT
           DATE(al.check_time) AS date,
           al.device_sn,
           d.device_name,
           COUNT(*) AS total_punches,
           COUNT(DISTINCT al.device_user_id) AS unique_users,
           SUM(CASE WHEN al.matched = 1 THEN 1 ELSE 0 END) AS matched,
           SUM(CASE WHEN al.matched = 0 THEN 1 ELSE 0 END) AS unmatched,
           SUM(CASE WHEN al.io_mode = 0 THEN 1 ELSE 0 END) AS check_ins,
           SUM(CASE WHEN al.io_mode = 1 THEN 1 ELSE 0 END) AS check_outs,
           MIN(al.check_time) AS first_punch,
           MAX(al.check_time) AS last_punch
         FROM zk_attendance_logs al
         LEFT JOIN devices d ON al.device_sn = d.sn
         WHERE ${conditions.join(' AND ')}
         GROUP BY DATE(al.check_time), al.device_sn, d.device_name
         ORDER BY date DESC, al.device_sn`,
        params,
      );
    } else if (reportType === 'user') {
      // Per-user summary
      data = await query(
        `SELECT
           al.device_user_id,
           m.user_type,
           al.student_id, al.staff_id,
           COUNT(*) AS total_punches,
           COUNT(DISTINCT DATE(al.check_time)) AS days_present,
           MIN(al.check_time) AS first_seen,
           MAX(al.check_time) AS last_seen,
           al.matched
         FROM zk_attendance_logs al
         LEFT JOIN zk_user_mapping m ON al.device_user_id = m.device_user_id
         WHERE al.school_id = ? AND DATE(al.check_time) BETWEEN ? AND ?
         GROUP BY al.device_user_id, m.user_type, al.student_id, al.staff_id, al.matched
         ORDER BY total_punches DESC`,
        [schoolId, dateFrom, dateTo],
      );
    } else if (reportType === 'device') {
      // Device health report
      data = await query(
        `SELECT
           d.sn AS serial_number, d.device_name, d.location, d.model_name AS model, d.status,
           d.last_seen AS last_heartbeat, d.last_activity,
           CASE
             WHEN d.last_seen > DATE_SUB(NOW(), INTERVAL 2 MINUTE) THEN 'online'
             WHEN d.last_seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'delayed'
             ELSE 'offline'
           END AS connection_status,
           COALESCE(logs.total_today, 0) AS punches_today,
           COALESCE(logs.total_week, 0) AS punches_week,
           COALESCE(cmds.pending, 0) AS pending_commands,
           COALESCE(cmds.failed, 0) AS failed_commands
         FROM devices d
         LEFT JOIN (
           SELECT device_sn,
             SUM(CASE WHEN DATE(check_time) = CURDATE() THEN 1 ELSE 0 END) AS total_today,
             SUM(CASE WHEN check_time >= DATE_SUB(CURDATE(), INTERVAL 7 DAY) THEN 1 ELSE 0 END) AS total_week
           FROM zk_attendance_logs WHERE school_id = ?
           GROUP BY device_sn
         ) logs ON d.sn = logs.device_sn
         LEFT JOIN (
           SELECT device_sn,
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
             SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
           FROM zk_device_commands WHERE school_id = ?
           GROUP BY device_sn
         ) cmds ON d.sn = cmds.device_sn
         WHERE d.school_id = ?
         ORDER BY d.device_name`,
        [schoolId, schoolId, schoolId],
      );
    }

    return NextResponse.json({
      success: true,
      data,
      meta: { reportType, dateFrom, dateTo, deviceSn },
    });
  } catch (err) {
    console.error('[ZK Reports] Error:', err);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
