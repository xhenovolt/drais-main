/** Device Intelligence — loader feeding the pure scorer from existing tables. */
import { query } from '@/lib/db';
import { scoreDevice, type DeviceSignals } from './device-intelligence';

export async function loadDeviceReputations(schoolId: number) {
  const devices = (await query(
    `SELECT sn, device_name, device_type, is_online, last_seen, firmware_version,
            lan_ip, device_user_count
       FROM devices WHERE school_id = ? AND deleted_at IS NULL`,
    [schoolId],
  )) as any[];

  const one = async (sql: string, params: any[]) => ((await query(sql, params).catch(() => [])) as any[])[0] || null;

  const out = [];
  for (const d of devices) {
    const [clock, lag, activity] = await Promise.all([
      one(`SELECT COUNT(*) tracked, SUM(status='anomaly') anomaly, ROUND(AVG(confidence)) avg_conf
             FROM device_clock_health
            WHERE school_id = ? AND device_sn = ? AND local_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
        [schoolId, d.sn]),
      one(`SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, punch_at, ingested_at))) median_lag
             FROM attendance_raw_events
            WHERE school_id = ? AND device_sn = ? AND ingested_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
              AND ingested_at IS NOT NULL`,
        [schoolId, d.sn]),
      one(`SELECT COUNT(DISTINCT DATE(DATE_ADD(punch_at, INTERVAL 180 MINUTE))) active_days
             FROM attendance_raw_events
            WHERE school_id = ? AND device_sn = ? AND punch_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)`,
        [schoolId, d.sn]),
    ]);

    const activeDays = Number(activity?.active_days || 0);
    // "Gap days" = school days (approx weekdays in 30) with no punches. Use a
    // simple ~22-school-day expectation floored at observed activity.
    const gapDays = Math.max(0, Math.min(30, 22 - activeDays));

    const signals: DeviceSignals = {
      known: true, isOnline: Number(d.is_online) === 1,
      minutesSinceLastSeen: d.last_seen ? Math.round((Date.now() - new Date(d.last_seen).getTime()) / 60_000) : null,
      clockAnomalyDays: Number(clock?.anomaly || 0),
      clockTrackedDays: Number(clock?.tracked || 0),
      avgClockConfidence: clock?.avg_conf == null ? null : Number(clock.avg_conf),
      medianIngestLagMin: lag?.median_lag == null ? null : Math.abs(Number(lag.median_lag)),
      gapDays30: activeDays > 0 ? gapDays : 0,
      activeDays30: activeDays,
      firmware: d.firmware_version || null,
    };
    out.push({
      sn: d.sn, device_name: d.device_name, device_type: d.device_type,
      is_online: Number(d.is_online) === 1, last_seen: d.last_seen,
      firmware: d.firmware_version, lan_ip: d.lan_ip, user_count: d.device_user_count,
      active_days_30: activeDays,
      reputation: scoreDevice(signals),
    });
  }
  return out.sort((a, b) => a.reputation.overall - b.reputation.overall); // worst first
}
