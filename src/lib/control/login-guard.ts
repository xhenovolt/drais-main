/**
 * Control Center — login brute-force guard (Phase 8 / E-1).
 *
 * Tracks failed logins per account and applies an exponential backoff + lockout
 * once a threshold is crossed, so the single credential that governs every
 * tenant can't be brute-forced. `throttleDecision` is PURE and unit-tested; the
 * DB helpers record/read attempts in a small `control_login_attempts` table.
 */
import { query } from '@/lib/db';

export interface ThrottleOpts { threshold?: number; windowMin?: number; baseSec?: number; maxSec?: number }
export interface ThrottleDecision { blocked: boolean; retryAfterSec: number; remaining: number }

/**
 * PURE: given the count of recent failures and how long ago the last one was,
 * decide whether to block and for how long.
 *   • under `threshold` failures → allowed (with a remaining count).
 *   • at/over `threshold` → locked for `base * 2^(over)` seconds (capped),
 *     measured from the last failure; the wait shrinks as time passes.
 */
export function throttleDecision(
  recentFailures: number, secondsSinceLast: number, opts: ThrottleOpts = {},
): ThrottleDecision {
  const threshold = opts.threshold ?? 5;
  const baseSec = opts.baseSec ?? 30;
  const maxSec = opts.maxSec ?? 900; // 15 min cap
  if (recentFailures < threshold) {
    return { blocked: false, retryAfterSec: 0, remaining: threshold - recentFailures };
  }
  const over = recentFailures - threshold; // 0,1,2,…
  const cooldown = Math.min(maxSec, baseSec * 2 ** over);
  const wait = Math.ceil(cooldown - Math.max(0, secondsSinceLast));
  return wait > 0 ? { blocked: true, retryAfterSec: wait, remaining: 0 }
                  : { blocked: false, retryAfterSec: 0, remaining: 0 };
}

const WINDOW_MIN = 15;

export function ensureLoginAttemptsSchema(): Promise<void> {
  return query(
    `CREATE TABLE IF NOT EXISTS control_login_attempts (
       id BIGINT PRIMARY KEY AUTO_INCREMENT,
       email VARCHAR(190) NOT NULL,
       ip VARCHAR(64) DEFAULT NULL,
       success TINYINT NOT NULL DEFAULT 0,
       attempted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       KEY idx_email_time (email, attempted_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, [],
  ).then(() => undefined).catch(() => undefined);
}

/** Recent failed-login count for an email + seconds since the last failure. */
export async function recentFailures(email: string): Promise<{ failures: number; secondsSinceLast: number }> {
  await ensureLoginAttemptsSchema();
  const rows = (await query(
    `SELECT COUNT(*) AS failures,
            COALESCE(TIMESTAMPDIFF(SECOND, MAX(attempted_at), NOW()), 999999) AS since
       FROM control_login_attempts
      WHERE email = ? AND success = 0 AND attempted_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [String(email || '').toLowerCase().trim(), WINDOW_MIN],
  ).catch(() => [])) as any[];
  return { failures: Number(rows[0]?.failures || 0), secondsSinceLast: Number(rows[0]?.since ?? 999999) };
}

export async function recordLoginAttempt(email: string, ip: string | null, success: boolean): Promise<void> {
  await ensureLoginAttemptsSchema();
  await query(
    `INSERT INTO control_login_attempts (email, ip, success) VALUES (?, ?, ?)`,
    [String(email || '').toLowerCase().trim(), ip ?? null, success ? 1 : 0],
  ).catch(() => {});
}

/** Clear an account's recent failures (called after a successful login). */
export async function clearFailures(email: string): Promise<void> {
  await query(
    `DELETE FROM control_login_attempts WHERE email = ? AND success = 0`,
    [String(email || '').toLowerCase().trim()],
  ).catch(() => {});
}
