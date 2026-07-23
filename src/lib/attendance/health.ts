/**
 * Attendance Health Center (Phase 1 of the Attendance Intelligence Program).
 *
 * One place that answers "is attendance OK right now?" without SQL. Ten
 * checks across the whole pipeline (device → ingest → identity → verdicts →
 * SMS), each scored 0–100 with a concrete recommendation, rolled up into an
 * overall Attendance Health Score.
 *
 * computeOverallHealth() is PURE — exported for tests. Every check is
 * individually guarded: a failing check reports itself as unhealthy rather
 * than breaking the endpoint.
 */
import { query } from '@/lib/db';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';

export interface HealthCheck {
  key: string;
  label: string;
  score: number;            // 0..100
  status: 'healthy' | 'degraded' | 'critical' | 'unknown';
  detail: string;
  recommendation: string | null;
  weight: number;
}

export interface HealthReport {
  score: number;            // weighted overall 0..100
  status: 'healthy' | 'degraded' | 'critical';
  checks: HealthCheck[];
  recommendations: string[];
  generated_at: string;
}

const statusOf = (score: number): HealthCheck['status'] =>
  score >= 90 ? 'healthy' : score >= 70 ? 'degraded' : 'critical';

/** PURE: weighted rollup + ordered recommendations. */
export function computeOverallHealth(checks: HealthCheck[]): Omit<HealthReport, 'generated_at'> {
  const usable = checks.filter(c => c.status !== 'unknown');
  const totalW = usable.reduce((a, c) => a + c.weight, 0) || 1;
  const score = Math.round(usable.reduce((a, c) => a + c.score * c.weight, 0) / totalW);
  const recommendations = [...checks]
    .filter(c => c.recommendation && c.status !== 'healthy')
    .sort((a, b) => a.score - b.score)
    .map(c => c.recommendation!);
  return { score, status: statusOf(score) as 'healthy' | 'degraded' | 'critical', checks, recommendations };
}

const check = (
  key: string, label: string, weight: number,
  score: number, detail: string, recommendation: string | null = null,
): HealthCheck => ({ key, label, weight, score: Math.max(0, Math.min(100, Math.round(score))), status: statusOf(score), detail, recommendation });

const unknown = (key: string, label: string, weight: number, why: string): HealthCheck =>
  ({ key, label, weight, score: 0, status: 'unknown', detail: why, recommendation: null });

export async function runHealthChecks(schoolId: number): Promise<HealthReport> {
  const checks: HealthCheck[] = [];
  const guard = async (fn: () => Promise<HealthCheck>, key: string, label: string, weight: number) => {
    try { checks.push(await fn()); }
    catch (e) { checks.push(unknown(key, label, weight, `Check failed: ${(e as Error).message}`)); }
  };

  const policy = await resolveTimePolicy(schoolId).catch(() => ({ offsetMinutes: 180 } as any));
  const off = policy.offsetMinutes;
  const localNow = new Date(Date.now() + off * 60_000);
  const localDate = localNow.toISOString().slice(0, 10);
  const utcDayStart = new Date(Date.parse(`${localDate}T00:00:00Z`) - off * 60_000);

  // 1 · Device connectivity
  await guard(async () => {
    const rows = (await query(
      `SELECT COUNT(*) total, SUM(is_online = 1) online FROM devices WHERE school_id = ?`,
      [schoolId],
    )) as any[];
    const total = Number(rows[0]?.total || 0), online = Number(rows[0]?.online || 0);
    if (!total) return check('devices', 'Device connectivity', 1.5, 100, 'No devices registered — nothing to monitor.');
    const score = (online / total) * 100;
    return check('devices', 'Device connectivity', 1.5, score,
      `${online}/${total} devices online.`,
      online < total ? `${total - online} device(s) offline — check power/network at the school.` : null);
  }, 'devices', 'Device connectivity', 1.5);

  // 2 · Heartbeats (freshness of last_seen)
  await guard(async () => {
    const rows = (await query(
      `SELECT device_name, sn, TIMESTAMPDIFF(MINUTE, last_seen, NOW()) age_min
         FROM devices WHERE school_id = ? AND last_seen IS NOT NULL ORDER BY age_min DESC`,
      [schoolId],
    )) as any[];
    if (!rows.length) return check('heartbeat', 'Device heartbeats', 1, 100, 'No heartbeat history yet.');
    const worst = rows[0];
    const age = Number(worst.age_min ?? 0);
    const score = age <= 15 ? 100 : age <= 60 ? 85 : age <= 24 * 60 ? 55 : 20;
    return check('heartbeat', 'Device heartbeats', 1, score,
      `Stalest heartbeat: ${worst.device_name || worst.sn} — ${age < 60 ? `${age} min` : `${Math.round(age / 60)}h`} ago.`,
      score < 90 ? 'A device has not reported recently — verify its internet/ADMS settings.' : null);
  }, 'heartbeat', 'Device heartbeats', 1);

  // 3 · Attendance flow (today vs learned volume)
  await guard(async () => {
    const [todayRows, blRows] = await Promise.all([
      query(`SELECT COUNT(*) n FROM attendance_raw_events WHERE school_id = ? AND punch_at >= ?`, [schoolId, utcDayStart]) as Promise<any[]>,
      query(`SELECT SUM(median_daily_punches) expected FROM attendance_time_baselines WHERE school_id = ?`, [schoolId]).catch(() => [{ expected: null }]) as Promise<any[]>,
    ]);
    const today = Number(todayRows[0]?.n || 0);
    const expected = Number(blRows[0]?.expected || 0);
    const hour = localNow.getUTCHours();
    if (!expected) return check('flow', 'Attendance flow', 1.5, today > 0 ? 100 : 70, `${today} punches today (no learned volume yet).`);
    if (hour < 8) return check('flow', 'Attendance flow', 1.5, 100, `${today} punches so far — too early to judge volume.`);
    const frac = Math.min(1, today / (expected * Math.min(1, hour / 17)));
    const score = frac >= 0.6 ? 100 : frac >= 0.3 ? 70 : 25;
    return check('flow', 'Attendance flow', 1.5, score,
      `${today} punches today vs ~${expected} on a normal day.`,
      score < 90 ? 'Punch volume is far below normal — device may be offline or storing without uploading. Open the Recovery/device pages.' : null);
  }, 'flow', 'Attendance flow', 1.5);

  // 4 · Time synchronization (today's clock confidence)
  await guard(async () => {
    const rows = (await query(
      `SELECT device_sn, confidence, status, likely_cause FROM device_clock_health
        WHERE school_id = ? AND local_date = ? ORDER BY confidence ASC`,
      [schoolId, localDate],
    )) as any[];
    if (!rows.length) return check('time', 'Time synchronization', 1.5, 95, 'No batches assessed yet today.');
    const worst = rows[0];
    return check('time', 'Time synchronization', 1.5, Number(worst.confidence),
      `Lowest device time confidence today: ${worst.device_sn} at ${worst.confidence}% (${worst.likely_cause}).`,
      Number(worst.confidence) < 80 ? 'Open Time Health to review and correct the batch, and fix the device clock.' : null);
  }, 'time', 'Time synchronization', 1.5);

  // 5 · SMS health (last 48h)
  await guard(async () => {
    const rows = (await query(
      `SELECT status, COUNT(*) n FROM notification_outbox
        WHERE school_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR) GROUP BY status`,
      [schoolId],
    )) as any[];
    const by: Record<string, number> = {};
    for (const r of rows) by[r.status] = Number(r.n);
    const sent = (by.delivered || 0) + (by.sent || 0);
    const failed = by.failed || 0;
    const total = sent + failed;
    if (!total) return check('sms', 'SMS health', 1, 100, 'No SMS attempted in the last 48h.');
    const score = (sent / total) * 100;
    return check('sms', 'SMS health', 1, score, `${sent}/${total} SMS delivered in 48h (${failed} failed).`,
      failed > 0 ? 'SMS failures present — check provider balance/credentials in notification settings.' : null);
  }, 'sms', 'SMS health', 1);

  // 6 · Identity mapping (7-day matched ratio)
  await guard(async () => {
    const rows = (await query(
      `SELECT COUNT(*) total, SUM(matched = 1) matched FROM attendance_raw_events
        WHERE school_id = ? AND punch_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [schoolId],
    )) as any[];
    const total = Number(rows[0]?.total || 0), matched = Number(rows[0]?.matched || 0);
    if (!total) return check('identity', 'Identity mapping', 1.5, 100, 'No punches in the last 7 days.');
    const score = (matched / total) * 100;
    return check('identity', 'Identity mapping', 1.5, score,
      `${matched}/${total} punches matched to people (7 days).`,
      score < 95 ? `${total - matched} unmatched punches — use "Detect & map" on the Unmatched tab.` : null);
  }, 'identity', 'Identity mapping', 1.5);

  // 7 · Queue health (stuck outbox items)
  await guard(async () => {
    const rows = (await query(
      `SELECT COUNT(*) n FROM notification_outbox
        WHERE school_id = ? AND status = 'queued' AND created_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
      [schoolId],
    )) as any[];
    const stuck = Number(rows[0]?.n || 0);
    const score = stuck === 0 ? 100 : stuck < 10 ? 70 : 30;
    return check('queue', 'Notification queue', 0.5, score,
      stuck ? `${stuck} messages stuck in queue > 15 min.` : 'Queue is draining normally.',
      stuck ? 'Outbox drainer may be idle — any page load nudges it; persistent backlog means provider errors.' : null);
  }, 'queue', 'Notification queue', 0.5);

  // 8 · Background jobs (stuck acquisitions)
  await guard(async () => {
    const rows = (await query(
      `SELECT COUNT(*) n FROM attendance_acquisitions
        WHERE school_id = ? AND status IN ('pulling','staged','validated')
          AND created_at < DATE_SUB(NOW(), INTERVAL 2 HOUR)`,
      [schoolId],
    ).catch(() => [{ n: 0 }])) as any[];
    const stuck = Number(rows[0]?.n || 0);
    return check('jobs', 'Background jobs', 0.5, stuck ? 60 : 100,
      stuck ? `${stuck} device pull(s) stuck mid-flight > 2h.` : 'No stuck pulls or jobs.',
      stuck ? 'Open Device Control and discard or re-run the stalled acquisition.' : null);
  }, 'jobs', 'Background jobs', 0.5);

  // 9 · Database health (latency probe)
  await guard(async () => {
    const t0 = Date.now();
    await query('SELECT 1', []);
    const ms = Date.now() - t0;
    const score = ms < 250 ? 100 : ms < 1000 ? 80 : 40;
    return check('db', 'Database', 0.5, score, `Query round-trip ${ms} ms.`,
      score < 90 ? 'Database latency is elevated — TiDB region or network issue.' : null);
  }, 'db', 'Database', 0.5);

  // 10 · Device clock reputation (30 days)
  await guard(async () => {
    const rows = (await query(
      `SELECT COUNT(*) days, SUM(status = 'anomaly') bad FROM device_clock_health
        WHERE school_id = ? AND local_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`,
      [schoolId],
    )) as any[];
    const days = Number(rows[0]?.days || 0), bad = Number(rows[0]?.bad || 0);
    if (!days) return check('device_rep', 'Device clock reputation', 1, 95, 'No clock history yet.');
    const score = 100 - (bad / days) * 100;
    return check('device_rep', 'Device clock reputation', 1, score,
      `${bad}/${days} tracked device-days had clock anomalies (30d).`,
      bad > 2 ? 'A device drifts repeatedly — its RTC coin-cell battery likely needs replacement.' : null);
  }, 'device_rep', 'Device clock reputation', 1);

  const rollup = computeOverallHealth(checks);
  return { ...rollup, generated_at: new Date().toISOString() };
}
