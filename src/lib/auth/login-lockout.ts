/**
 * School login — brute-force guard and account lockout (Phase 2).
 *
 * THE DEFECT THIS CLOSES
 * ----------------------
 * `/api/auth/login` incremented `users.failed_login_attempts` on every failure
 * and reset it on success, but NEVER read it. Its own comment said
 * "(optional: implement rate limiting)". Password guessing against any school
 * account was unlimited. The Control Center had a proper throttle
 * (src/lib/control/login-guard.ts) — it was simply never applied to the surface
 * that school staff actually sign in through.
 *
 * WHY THE LOCK LIVES ON THE USER ROW
 * ----------------------------------
 * `users.locked_until` and `users.failed_login_attempts` already existed in the
 * schema, unused. Anchoring the lock to the ACCOUNT rather than to an IP, a
 * cookie or a device is what makes it un-bypassable: switching browser, network
 * or machine changes nothing, because the state travels with the credential
 * being attacked. An IP-based throttle would be trivially defeated by the same
 * attacker and would punish a whole school behind one NAT.
 *
 * WHY THE BACKOFF IS BORROWED, NOT REWRITTEN
 * ------------------------------------------
 * `throttleDecision` in the Control Center guard is pure and already unit-tested.
 * Writing a second backoff formula here would mean two implementations drifting
 * apart, with the weaker one guarding the larger attack surface. Same policy,
 * one function.
 *
 * NOT A DENIAL-OF-SERVICE WEAPON
 * ------------------------------
 * Three properties keep a malicious lockout from becoming an outage:
 *   1. The lock EXPIRES on its own — it is a cooldown, not a dead bolt.
 *   2. The cooldown is progressive from 30s and capped at 15 minutes, so the
 *      worst an attacker can do is 15-minute windows, not a permanent lock.
 *   3. A Control Center operator can clear it immediately.
 * A permanent lock requiring administrator action would turn "guess a bursar's
 * password five times" into a way to stop a school from operating.
 *
 * DISCLOSURE
 * ----------
 * Callers must return the SAME generic message for a wrong password and a
 * locked account, and must not reveal whether an email exists, how many
 * attempts remain, or the threshold. The only extra signal is a Retry-After
 * header, which an already-locked-out legitimate user needs.
 */
import { query } from '@/lib/db';
import { throttleDecision } from '@/lib/control/login-guard';

/** Failures tolerated inside the window before the first cooldown applies. */
export const LOCKOUT_THRESHOLD = 5;
/** First cooldown, doubling per additional failure. */
export const LOCKOUT_BASE_SEC = 30;
/** Ceiling on any single cooldown — see "not a denial-of-service weapon". */
export const LOCKOUT_MAX_SEC = 900;
/** Failures older than this stop counting, so ordinary typos never accumulate. */
export const LOCKOUT_WINDOW_MIN = 15;

/**
 * `last_failed_login_at` is additive and nullable. Mirrors the
 * `ensureImpersonationColumn` pattern in src/lib/auth.ts: attempted once per
 * process, failure ignored because "already exists" is the expected steady
 * state. Without it the window cannot be measured and a user who mistypes
 * their password twice a term would eventually lock themselves out.
 */
let _col: Promise<void> | null = null;
export function ensureLockoutColumn(): Promise<void> {
  if (_col) return _col;
  _col = (async () => {
    try {
      await query(`ALTER TABLE users ADD COLUMN last_failed_login_at TIMESTAMP NULL DEFAULT NULL`, []);
    } catch { /* already exists — fine */ }
  })();
  return _col;
}

export interface LockState {
  locked: boolean;
  retryAfterSec: number;
  lockedUntil: Date | null;
}

const UNLOCKED: LockState = { locked: false, retryAfterSec: 0, lockedUntil: null };

/**
 * Current lock state for an account. Read-only — safe to call before the
 * password is verified, which is the point: a locked account must not get a
 * bcrypt comparison at all.
 */
export async function getLockState(userId: number): Promise<LockState> {
  await ensureLockoutColumn();
  const rows = (await query(
    `SELECT locked_until,
            COALESCE(TIMESTAMPDIFF(SECOND, NOW(), locked_until), 0) AS retry_after
       FROM users
      WHERE id = ?
      LIMIT 1`,
    [userId],
  ).catch(() => [])) as any[];

  const row = rows[0];
  if (!row?.locked_until) return UNLOCKED;

  const retryAfterSec = Number(row.retry_after || 0);
  if (retryAfterSec <= 0) return UNLOCKED; // expired; cleared lazily on next failure/success

  return { locked: true, retryAfterSec, lockedUntil: new Date(row.locked_until) };
}

/**
 * Record a failed attempt and apply the cooldown if the threshold is crossed.
 * Returns the resulting lock state so the caller can set Retry-After.
 *
 * Never throws: a guard that 500s on a logging failure would turn a wrong
 * password into an outage.
 */
export async function registerFailedAttempt(userId: number): Promise<LockState> {
  await ensureLockoutColumn();
  try {
    const rows = (await query(
      `SELECT COALESCE(failed_login_attempts, 0) AS attempts,
              COALESCE(TIMESTAMPDIFF(SECOND, last_failed_login_at, NOW()), 999999) AS since
         FROM users WHERE id = ? LIMIT 1`,
      [userId],
    )) as any[];

    const since = Number(rows[0]?.since ?? 999999);
    // Outside the window the slate is clean — this failure starts a new run.
    const attempts = since > LOCKOUT_WINDOW_MIN * 60 ? 1 : Number(rows[0]?.attempts || 0) + 1;

    const decision = throttleDecision(attempts, 0, {
      threshold: LOCKOUT_THRESHOLD,
      baseSec:   LOCKOUT_BASE_SEC,
      maxSec:    LOCKOUT_MAX_SEC,
    });

    if (decision.blocked) {
      await query(
        `UPDATE users
            SET failed_login_attempts = ?,
                last_failed_login_at  = NOW(),
                locked_until          = DATE_ADD(NOW(), INTERVAL ? SECOND)
          WHERE id = ?`,
        [attempts, decision.retryAfterSec, userId],
      );
      return {
        locked: true,
        retryAfterSec: decision.retryAfterSec,
        lockedUntil: new Date(Date.now() + decision.retryAfterSec * 1000),
      };
    }

    await query(
      `UPDATE users
          SET failed_login_attempts = ?,
              last_failed_login_at  = NOW(),
              locked_until          = NULL
        WHERE id = ?`,
      [attempts, userId],
    );
    return UNLOCKED;
  } catch {
    return UNLOCKED;
  }
}

/** Clear counters after a successful sign-in. Never throws. */
export async function clearFailedAttempts(userId: number): Promise<void> {
  await query(
    `UPDATE users
        SET failed_login_attempts = 0,
            last_failed_login_at  = NULL,
            locked_until          = NULL
      WHERE id = ?`,
    [userId],
  ).catch(() => {});
}

/**
 * Administrative unlock / lock, used by the Control Center.
 * `until = null` unlocks; a Date locks until that instant.
 */
export async function setAccountLock(userId: number, until: Date | null): Promise<void> {
  await ensureLockoutColumn();
  if (until) {
    await query(
      `UPDATE users SET locked_until = ?, last_failed_login_at = NOW() WHERE id = ?`,
      [until, userId],
    );
  } else {
    await clearFailedAttempts(userId);
  }
}
