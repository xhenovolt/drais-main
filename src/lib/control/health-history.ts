/**
 * Control Center — health history, scoring, and founder alerting (Phase 17 /
 * E-12 + E-13). Turns the point-in-time platform-health scan into a trend + a
 * push: a daily snapshot per school (score + issues), and an alert to the
 * founder when a school newly turns critical — so problems find you, not the
 * other way round. Runs as a job on the single-cron job runner (no new cron).
 *
 * `healthScore` is PURE + unit-tested.
 */
import { query } from '@/lib/db';
import { controlAudit } from '@/lib/control/auth';
import { getPlatformHealth, type HealthIssue } from '@/lib/control/platform-health';

/** PURE: 0–100 health score from a school's issues (critical bites hardest). */
export function healthScore(issues: ReadonlyArray<Pick<HealthIssue, 'severity'>>): number {
  const weight: Record<string, number> = { critical: 40, warning: 15, info: 5 };
  let score = 100;
  for (const i of issues) score -= weight[i.severity] || 0;
  return Math.max(0, Math.min(100, score));
}

let ensured: Promise<void> | null = null;
export function ensureHealthHistorySchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS platform_health_snapshots (
         id BIGINT PRIMARY KEY AUTO_INCREMENT,
         school_id BIGINT NOT NULL,
         snapshot_date DATE NOT NULL,
         score INT NOT NULL DEFAULT 100,
         worst VARCHAR(16) DEFAULT NULL,
         issue_count INT NOT NULL DEFAULT 0,
         issues JSON,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         UNIQUE KEY uk_school_day (school_id, snapshot_date)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
    await query(
      `CREATE TABLE IF NOT EXISTS platform_alerts (
         id BIGINT PRIMARY KEY AUTO_INCREMENT,
         school_id BIGINT DEFAULT NULL,
         kind VARCHAR(40) NOT NULL,
         severity VARCHAR(16) NOT NULL DEFAULT 'critical',
         message VARCHAR(400) NOT NULL,
         acknowledged_at DATETIME DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         KEY idx_created (created_at),
         UNIQUE KEY uk_school_kind_day (school_id, kind, (CAST(created_at AS DATE)))
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []).catch(async () => {
        // Older MySQL can't index an expression — fall back without the unique key.
        await query(
          `CREATE TABLE IF NOT EXISTS platform_alerts (
             id BIGINT PRIMARY KEY AUTO_INCREMENT, school_id BIGINT DEFAULT NULL,
             kind VARCHAR(40) NOT NULL, severity VARCHAR(16) NOT NULL DEFAULT 'critical',
             message VARCHAR(400) NOT NULL, acknowledged_at DATETIME DEFAULT NULL,
             created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_created (created_at)
           ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []).catch(() => {});
      });
  })();
  return ensured;
}

async function alertedToday(schoolId: number, kind: string): Promise<boolean> {
  const r = (await query(
    `SELECT 1 FROM platform_alerts WHERE school_id = ? AND kind = ? AND DATE(created_at) = CURDATE() LIMIT 1`,
    [schoolId, kind],
  ).catch(() => [])) as any[];
  return r.length > 0;
}

async function postAlertWebhook(payload: any): Promise<void> {
  const url = process.env.PLATFORM_ALERT_WEBHOOK;
  if (!url) return;
  await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) }).catch(() => {});
}

/**
 * Daily health job: snapshot every school's score + issues, and alert the
 * founder about schools that NEWLY turned critical (vs yesterday's snapshot).
 * Idempotent per day. Returns a summary.
 */
export async function runHealthSnapshotJob(): Promise<{ snapshotted: number; alerts: number }> {
  await ensureHealthHistorySchema();
  const { schools } = await getPlatformHealth();
  let alerts = 0;

  for (const s of schools) {
    const score = healthScore(s.issues);
    await query(
      `INSERT INTO platform_health_snapshots (school_id, snapshot_date, score, worst, issue_count, issues)
       VALUES (?, CURDATE(), ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE score = VALUES(score), worst = VALUES(worst),
         issue_count = VALUES(issue_count), issues = VALUES(issues)`,
      [s.id, score, s.worst, s.issues.length, JSON.stringify(s.issues)],
    ).catch(() => {});

    if (s.worst === 'critical') {
      // Was it already critical yesterday? Only alert on a NEW critical.
      const y = (await query(
        `SELECT worst FROM platform_health_snapshots WHERE school_id = ? AND snapshot_date = DATE_SUB(CURDATE(), INTERVAL 1 DAY) LIMIT 1`,
        [s.id],
      ).catch(() => [])) as any[];
      const newlyCritical = !y[0] || y[0].worst !== 'critical';
      if (newlyCritical && !(await alertedToday(s.id, 'school_critical'))) {
        const message = `${s.name}: ${s.issues.map((i) => i.detail).slice(0, 3).join('; ')}`.slice(0, 400);
        await query(
          `INSERT INTO platform_alerts (school_id, kind, severity, message) VALUES (?, 'school_critical', 'critical', ?)`,
          [s.id, message],
        ).catch(() => {});
        await controlAudit(null, 'platform_alert', `schools:${s.id}`, { kind: 'school_critical', score }, null).catch(() => {});
        await postAlertWebhook({ event: 'school_critical', school_id: s.id, school: s.name, score, issues: s.issues });
        alerts++;
      }
    }
  }
  return { snapshotted: schools.length, alerts };
}

/** Recent score trend for a school (for the ops view). */
export async function schoolHealthTrend(schoolId: number, days = 14): Promise<Array<{ date: string; score: number; worst: string | null }>> {
  await ensureHealthHistorySchema();
  const rows = (await query(
    `SELECT snapshot_date AS date, score, worst FROM platform_health_snapshots
      WHERE school_id = ? AND snapshot_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      ORDER BY snapshot_date ASC`, [schoolId, days],
  ).catch(() => [])) as any[];
  return rows.map((r) => ({ date: String(r.date).slice(0, 10), score: Number(r.score), worst: r.worst }));
}

/** Recent unacknowledged founder alerts (feed). */
export async function listAlerts(limit = 40): Promise<any[]> {
  await ensureHealthHistorySchema();
  return (await query(
    `SELECT a.id, a.school_id, s.name AS school, a.kind, a.severity, a.message, a.acknowledged_at, a.created_at
       FROM platform_alerts a LEFT JOIN schools s ON s.id = a.school_id
      ORDER BY a.id DESC LIMIT ?`, [limit],
  ).catch(() => [])) as any[];
}

export async function acknowledgeAlert(id: number, operatorId: number, ip?: string | null): Promise<void> {
  await query(`UPDATE platform_alerts SET acknowledged_at = NOW() WHERE id = ?`, [id]).catch(() => {});
  await controlAudit(operatorId, 'alert_acknowledged', `alerts:${id}`, null, ip ?? null).catch(() => {});
}
