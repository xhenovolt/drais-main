/**
 * @drais/repo — offline brute-force lockout, mirroring src/lib/auth/
 * login-lockout.ts exactly (same threshold/backoff/window constants, same
 * three-function shape: check / register-failure / clear), against a
 * locally-provisioned UserRecord instead of a raw query().
 *
 * Confirmed design (2026-08-21, user, AskUserQuestion): lockout applies
 * offline identically to online — arguably more important offline, since
 * a stolen device has no network-based defenses at all.
 *
 * throttleDecision() (src/lib/control/login-guard.ts) IS reused directly,
 * not duplicated — unlike classifyPlan() in offline-auth/subscription.ts
 * (see that file's header for why that one wasn't safe to reuse).
 * throttleDecision is genuinely pure (no DB, no implicit "always a real
 * row" assumption — just arithmetic on the three numbers it's given), and
 * this file's own test exercises it end-to-end to confirm that, not just
 * trusts its doc comment — the exact discipline the classifyPlan mistake
 * was found by, applied proactively this time.
 */
import { throttleDecision } from '@/lib/control/login-guard';
import type { UserRepo } from '../contract/user-repo';
import type { UserRecord } from '../contract/types';

/** Same values as login-lockout.ts's own constants — deliberately
 *  duplicated, not imported (that file also carries DB-touching siblings
 *  in the same module; §25a's rule is to duplicate rather than couple new
 *  offline code to a live online file). Keep these in sync by hand if the
 *  online policy ever changes. */
export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_BASE_SEC = 30;
export const LOCKOUT_MAX_SEC = 900;
export const LOCKOUT_WINDOW_MIN = 15;

export interface LockState {
  locked: boolean;
  retryAfterSec: number;
  lockedUntil: string | null;
}

const UNLOCKED: LockState = { locked: false, retryAfterSec: 0, lockedUntil: null };

/** Read-only — safe to call before the password is verified, which is the
 *  point: a locked account must not get a bcrypt comparison at all. */
export function getOfflineLockState(user: UserRecord, now: Date = new Date()): LockState {
  if (!user.lockedUntil) return UNLOCKED;
  const retryAfterSec = Math.ceil((new Date(user.lockedUntil).getTime() - now.getTime()) / 1000);
  if (retryAfterSec <= 0) return UNLOCKED; // expired; cleared lazily on next failure/success, same as online
  return { locked: true, retryAfterSec, lockedUntil: user.lockedUntil };
}

/** Record a failed attempt and apply the cooldown if the threshold is
 *  crossed. Returns the resulting lock state. Never throws — a guard that
 *  errors on a bookkeeping write would turn a wrong password into an
 *  outage, same reasoning as the online version. */
export async function registerOfflineFailedAttempt(
  users: UserRepo, schoolId: number, user: UserRecord, now: Date = new Date(),
): Promise<LockState> {
  try {
    const lastFailedMs = user.lastFailedLoginAt ? new Date(user.lastFailedLoginAt).getTime() : null;
    const sinceSec = lastFailedMs != null ? (now.getTime() - lastFailedMs) / 1000 : Number.POSITIVE_INFINITY;
    // Outside the window the slate is clean — this failure starts a new run.
    const attempts = sinceSec > LOCKOUT_WINDOW_MIN * 60 ? 1 : (user.failedLoginAttempts ?? 0) + 1;

    const decision = throttleDecision(attempts, 0, {
      threshold: LOCKOUT_THRESHOLD, baseSec: LOCKOUT_BASE_SEC, maxSec: LOCKOUT_MAX_SEC,
    });
    const nowIso = now.toISOString();

    if (decision.blocked) {
      const lockedUntil = new Date(now.getTime() + decision.retryAfterSec * 1000).toISOString();
      await users.recordFailedLogin(schoolId, user.id, { failedLoginAttempts: attempts, lockedUntil, lastFailedLoginAt: nowIso });
      return { locked: true, retryAfterSec: decision.retryAfterSec, lockedUntil };
    }

    await users.recordFailedLogin(schoolId, user.id, { failedLoginAttempts: attempts, lockedUntil: null, lastFailedLoginAt: nowIso });
    return UNLOCKED;
  } catch {
    return UNLOCKED;
  }
}

/** Clear counters after a successful sign-in. Never throws. */
export async function clearOfflineFailedAttempts(users: UserRepo, schoolId: number, userId: number): Promise<void> {
  await users.clearLoginLockout(schoolId, userId).catch(() => {});
}
