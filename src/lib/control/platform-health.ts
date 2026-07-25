/**
 * Control Center — Platform Health Center (Roadmap P4).
 *
 * Cross-school proactive monitoring: instead of the founder discovering a broken
 * school by accident, the platform scans EVERY school and reports which ones
 * need attention and why — expired licences, stalled attendance, devices all
 * offline, clock drift, failed SMS, sync failures.
 *
 * Each monitor is a single GROUP BY query (no N+1); results merge into a
 * per-school issue register. The scoring helpers (`severityRank`, `worstOf`,
 * `rollup`) are PURE and unit-tested.
 */
import { query } from '@/lib/db';

export type Severity = 'critical' | 'warning' | 'info';
export interface HealthIssue { type: string; severity: Severity; detail: string }
export interface SchoolHealth { id: number; name: string; status: string; issues: HealthIssue[]; worst: Severity | null }

const SEV_ORDER: Record<Severity, number> = { critical: 3, warning: 2, info: 1 };

/** PURE: numeric rank so severities sort/compare deterministically. */
export function severityRank(s: Severity | null): number { return s ? SEV_ORDER[s] : 0; }

/** PURE: the most severe of a set of issues (null when none). */
export function worstOf(issues: HealthIssue[]): Severity | null {
  return issues.reduce<Severity | null>((w, i) => (severityRank(i.severity) > severityRank(w) ? i.severity : w), null);
}

/** PURE: platform rollup — counts by severity + by issue type. */
export function rollup(schools: SchoolHealth[]) {
  const bySeverity: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  const byType: Record<string, number> = {};
  let withIssues = 0;
  for (const s of schools) {
    if (s.issues.length) withIssues++;
    for (const i of s.issues) {
      bySeverity[i.severity]++;
      byType[i.type] = (byType[i.type] || 0) + 1;
    }
  }
  return { schoolsWithIssues: withIssues, bySeverity, byType };
}

const num = (rows: any[], key = 'n') => Number(rows?.[0]?.[key] || 0);
const listOf = async (sql: string, params: any[] = []) => (await query(sql, params).catch(() => [])) as any[];
const mapBy = <T extends { school_id: number }>(rows: T[]) => {
  const m = new Map<number, T>(); for (const r of rows) m.set(Number(r.school_id), r); return m;
};

/** Scan every school; return the per-school issue register + a rollup. */
export async function getPlatformHealth() {
  const [schools, punches, devices, clock, sms, sync] = await Promise.all([
    listOf(`SELECT id, name, status, subscription_end_date FROM schools WHERE deleted_at IS NULL`),
    listOf(`SELECT school_id, COUNT(*) n FROM attendance_raw_events
             WHERE punch_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR) GROUP BY school_id`),
    listOf(`SELECT school_id, COUNT(*) total, SUM(is_online = 1) online
              FROM devices WHERE deleted_at IS NULL AND status NOT IN ('retired') GROUP BY school_id`),
    listOf(`SELECT school_id, COUNT(*) n FROM device_clock_health
             WHERE local_date = CURDATE() AND status = 'anomaly' GROUP BY school_id`),
    listOf(`SELECT school_id, SUM(status = 'failed') failed FROM notification_outbox
             WHERE created_at >= DATE_SUB(NOW(), INTERVAL 48 HOUR) GROUP BY school_id HAVING failed > 0`),
    listOf(`SELECT school_id, COUNT(*) n FROM device_sync_state WHERE sync_status = 'out_of_sync' GROUP BY school_id`),
  ]);

  const punchMap = mapBy(punches);
  const devMap = mapBy(devices);
  const clockMap = mapBy(clock);
  const smsMap = mapBy(sms);
  const syncMap = mapBy(sync);
  const today = new Date();

  const out: SchoolHealth[] = schools.map((s: any) => {
    const id = Number(s.id);
    const active = s.status === 'active' || s.status == null;
    const dev = devMap.get(id);
    const totalDev = Number(dev?.total || 0);
    const onlineDev = Number(dev?.online || 0);
    const punches48 = num([punchMap.get(id)]);
    const issues: HealthIssue[] = [];

    // Licence
    if (s.subscription_end_date) {
      const end = new Date(s.subscription_end_date);
      const days = Math.round((end.getTime() - today.getTime()) / 86_400_000);
      if (days < 0) issues.push({ type: 'licence_expired', severity: 'critical', detail: `Licence expired ${-days}d ago` });
      else if (days <= 7) issues.push({ type: 'licence_expiring', severity: 'warning', detail: `Licence expires in ${days}d` });
    }
    // Attendance flow (only meaningful for an active school that has devices)
    if (active && totalDev > 0 && punches48 === 0) {
      issues.push({ type: 'no_attendance', severity: 'critical', detail: 'No punches in 48h despite registered devices' });
    }
    // Devices
    if (active && totalDev === 0) {
      issues.push({ type: 'no_devices', severity: 'warning', detail: 'No devices registered' });
    } else if (totalDev > 0 && onlineDev === 0) {
      issues.push({ type: 'devices_offline', severity: 'critical', detail: `All ${totalDev} device(s) offline` });
    }
    // Clock drift
    const anomalies = num([clockMap.get(id)]);
    if (anomalies > 0) issues.push({ type: 'clock_drift', severity: 'warning', detail: `${anomalies} device clock anomaly(ies) today` });
    // Failed SMS
    const failed = num([smsMap.get(id)], 'failed');
    if (failed > 0) issues.push({ type: 'sms_failed', severity: 'warning', detail: `${failed} SMS failed in 48h` });
    // Sync
    const oos = num([syncMap.get(id)]);
    if (oos > 0) issues.push({ type: 'sync_out_of_sync', severity: 'info', detail: `${oos} device(s) out of sync` });

    return { id, name: s.name, status: s.status ?? 'active', issues, worst: worstOf(issues) };
  });

  // Schools needing attention first, worst severity first, then issue count.
  out.sort((a, b) => severityRank(b.worst) - severityRank(a.worst) || b.issues.length - a.issues.length);
  return { schools: out, summary: { total: out.length, ...rollup(out) } };
}
