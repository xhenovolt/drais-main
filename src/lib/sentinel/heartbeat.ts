/**
 * DRAIS Sentinel — heartbeats.
 *
 * One row per named source, upserted in place. This is the mechanism behind
 * "job starts → heartbeat; job completes → heartbeat updated" AND behind
 * Sentinel monitoring itself: `sentinel_core_sweep` and
 * `sentinel_core_request_tap` are heartbeat names like any other.
 *
 * The critical design rule (non-negotiable per spec): absence of a heartbeat
 * row is NOT "healthy" — it is UNMONITORED. A heartbeat whose
 * expected_interval has elapsed without a fresh success is DEGRADED, never
 * silently reported healthy.
 */
import { query } from '@/lib/db';
import { ensureSentinelSchema } from './schema';
import type { HealthVerdict, HeartbeatStatus } from './types';

export async function beatStart(name: string, expectedIntervalSeconds?: number): Promise<void> {
  await ensureSentinelSchema();
  await query(
    `INSERT INTO sentinel_heartbeats (name, last_started_at, expected_interval_seconds)
     VALUES (?, NOW(), ?)
     ON DUPLICATE KEY UPDATE last_started_at = NOW(),
       expected_interval_seconds = COALESCE(VALUES(expected_interval_seconds), expected_interval_seconds)`,
    [name, expectedIntervalSeconds ?? null],
  ).catch(() => {});
}

export async function beatSuccess(name: string): Promise<void> {
  await ensureSentinelSchema();
  await query(
    `INSERT INTO sentinel_heartbeats (name, last_started_at, last_success_at, consecutive_failures)
     VALUES (?, NOW(), NOW(), 0)
     ON DUPLICATE KEY UPDATE last_success_at = NOW(), consecutive_failures = 0, last_error = NULL`,
    [name],
  ).catch(() => {});
}

export async function beatFailure(name: string, error: string): Promise<void> {
  await ensureSentinelSchema();
  await query(
    `INSERT INTO sentinel_heartbeats (name, last_started_at, last_failure_at, last_error, consecutive_failures)
     VALUES (?, NOW(), NOW(), ?, 1)
     ON DUPLICATE KEY UPDATE last_failure_at = NOW(), last_error = VALUES(last_error),
       consecutive_failures = consecutive_failures + 1`,
    [name, error.slice(0, 300)],
  ).catch(() => {});
}

/**
 * Verdict for one heartbeat source. PURE given the row — kept as a
 * standalone function so the chaos suite can assert it without touching
 * the database.
 */
export function evaluateHeartbeat(
  name: string,
  row: {
    last_success_at: string | Date | null;
    last_failure_at: string | Date | null;
    consecutive_failures: number;
    expected_interval_seconds: number | null;
  } | null,
  nowMs: number,
): HeartbeatStatus {
  if (!row || (!row.last_success_at && !row.last_failure_at)) {
    return {
      name, verdict: 'unmonitored', lastSuccessAt: null, lastFailureAt: null,
      consecutiveFailures: 0, expectedIntervalSeconds: row?.expected_interval_seconds ?? null, staleBy: null,
    };
  }
  const lastSuccessMs = row.last_success_at ? new Date(row.last_success_at).getTime() : null;
  const lastFailureMs = row.last_failure_at ? new Date(row.last_failure_at).getTime() : null;

  // Currently failing and never recovered.
  if (row.consecutive_failures > 0 && (lastSuccessMs === null || (lastFailureMs !== null && lastFailureMs > lastSuccessMs))) {
    return {
      name, verdict: 'degraded', lastSuccessAt: row.last_success_at ? new Date(row.last_success_at).toISOString() : null,
      lastFailureAt: row.last_failure_at ? new Date(row.last_failure_at).toISOString() : null,
      consecutiveFailures: row.consecutive_failures, expectedIntervalSeconds: row.expected_interval_seconds, staleBy: null,
    };
  }

  // Has an expected cadence — check staleness.
  if (row.expected_interval_seconds && lastSuccessMs !== null) {
    const staleBy = Math.floor((nowMs - lastSuccessMs) / 1000) - row.expected_interval_seconds;
    if (staleBy > 0) {
      return {
        name, verdict: 'degraded', lastSuccessAt: new Date(lastSuccessMs).toISOString(), lastFailureAt: null,
        consecutiveFailures: 0, expectedIntervalSeconds: row.expected_interval_seconds, staleBy,
      };
    }
  }

  return {
    name, verdict: 'healthy',
    lastSuccessAt: lastSuccessMs !== null ? new Date(lastSuccessMs).toISOString() : null,
    lastFailureAt: null, consecutiveFailures: 0,
    expectedIntervalSeconds: row.expected_interval_seconds, staleBy: null,
  };
}

/**
 * "Now," from the DATABASE's own clock, not this process's. Discovered as a
 * real bug during live verification: comparing a DB-written last_success_at
 * against the calling process's Date.now() makes staleness detection
 * sensitive to ordinary app-server/DB-server clock skew (measured ~3.5s in
 * this environment) — precisely the class of bug Sentinel exists to catch
 * in attendance data. Every staleness comparison must happen in one clock's
 * frame of reference; the database's is the one both the write (NOW() in
 * beatSuccess/beatFailure) and the read share.
 */
async function dbNowMs(): Promise<number> {
  const rows = (await query(`SELECT UNIX_TIMESTAMP() AS t`).catch(() => [{ t: Date.now() / 1000 }])) as Array<{ t: number | string }>;
  const t = Number(rows[0]?.t);
  return Number.isFinite(t) ? t * 1000 : Date.now();
}

export async function heartbeatStatus(name: string): Promise<HeartbeatStatus> {
  await ensureSentinelSchema();
  const [rows, nowMs] = await Promise.all([
    query(
      `SELECT last_success_at, last_failure_at, consecutive_failures, expected_interval_seconds
         FROM sentinel_heartbeats WHERE name = ? LIMIT 1`,
      [name],
    ).catch(() => [] as any[]),
    dbNowMs(),
  ]);
  return evaluateHeartbeat(name, (rows as any[])[0] ?? null, nowMs);
}

export async function allHeartbeats(): Promise<HeartbeatStatus[]> {
  await ensureSentinelSchema();
  const [rows, nowMs] = await Promise.all([
    query(
      `SELECT name, last_success_at, last_failure_at, consecutive_failures, expected_interval_seconds
         FROM sentinel_heartbeats ORDER BY name ASC`,
    ).catch(() => [] as any[]),
    dbNowMs(),
  ]);
  return (rows as any[]).map((r) => evaluateHeartbeat(r.name, r, nowMs));
}

/** Well-known heartbeat names — one place, so nobody typos a job name. */
export const HEARTBEATS = {
  SENTINEL_SWEEP: 'sentinel_core_sweep',
  SENTINEL_REQUEST_TAP: 'sentinel_core_request_tap',
  SENTINEL_ALERT_DISPATCH: 'sentinel_alert_dispatch',
  JOB_DUNNING: 'job_dunning',
  JOB_PLATFORM_HEALTH: 'job_platform_health',
  NOTIFICATION_DRAIN: 'notification_drain',
} as const;

export type VerdictLabel = HealthVerdict;
