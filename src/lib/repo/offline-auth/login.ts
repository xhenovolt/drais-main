/**
 * @drais/repo — the complete offline login flow.
 *
 * Ties together every piece built across Phase 7 sub-efforts 6-8:
 * UserRepo.findByEmail (users/RBAC data layer), lockout.ts (brute-force
 * guard), subscription.ts (carried subscription access), session.ts
 * (local session creation), audit.ts (local audit trail). Mirrors
 * src/app/api/auth/login/route.ts's real flow and ordering as closely as
 * the offline context allows — same status checks, same lockout-before-
 * password-compare ordering, same generic "Invalid email or password"
 * disclosure discipline (a locked account and a wrong password must be
 * indistinguishable to the caller).
 *
 * Genuinely NEW code, not shared with online: bcrypt.compare, the status/
 * lockout/subscription checks, and session creation are all re-run here
 * against local data, per §25a's rule — the online login route is not
 * touched, imported, or depended on by this file in any way.
 *
 * Deliberately does NOT touch src/lib/auth.ts, the real login route, or
 * any live code — lands inert, same as every file in this repo layer so
 * far. This is what a future `if (mode === 'local-sqlite')` branch in
 * those files would call; it isn't that branch itself.
 */
import bcrypt from 'bcryptjs';
import type { SqliteConnection } from '../sqlite/connection';
import type { Repos } from '../contract';
import { getOfflineLockState, registerOfflineFailedAttempt, clearOfflineFailedAttempts } from './lockout';
import { evaluateOfflineSubscriptionAccess } from './subscription';
import { appendOfflineAuditEvent } from './audit';
import { createOfflineSession, type OfflineSessionRecord } from './session';

export interface OfflineLoginInput {
  email: string;
  password: string;
  /** A local install always knows its own school (§9: one school per
   *  install) — unlike online, this isn't discovered from the login
   *  attempt, it's given (see UserRepo.findByEmail's own header on this
   *  same design difference). */
  schoolId: number;
  ip?: string | null;
  userAgent?: string | null;
}

export type OfflineLoginFailureCode =
  | 'INVALID_CREDENTIALS' | 'ACCOUNT_PENDING' | 'ACCOUNT_INACTIVE'
  | 'SCHOOL_SUSPENDED' | 'SUBSCRIPTION_EXPIRED';

export type OfflineLoginResult =
  | {
      ok: true;
      session: OfflineSessionRecord;
      user: { id: number; email: string; firstName: string; lastName: string; mustChangePassword: boolean };
    }
  | { ok: false; code: OfflineLoginFailureCode; retryAfterSec?: number };

export async function attemptOfflineLogin(db: SqliteConnection, repos: Repos, input: OfflineLoginInput): Promise<OfflineLoginResult> {
  const now = new Date();
  const audit = (action: string, userId: number | null, details?: Record<string, unknown>) =>
    appendOfflineAuditEvent(db, { schoolId: input.schoolId, userId, action, entityType: 'user', entityId: userId, details, ip: input.ip, userAgent: input.userAgent }, now);

  // 1. School-level gate first — cheap, no user data needed, and a
  //    suspended/lapsed school should refuse every login regardless of
  //    which account is attempting it.
  const school = await repos.schools.findById(input.schoolId);
  if (school?.status === 'suspended') {
    audit('LOGIN_FAILED', null, { email: input.email.toLowerCase(), reason: 'school_suspended' });
    return { ok: false, code: 'SCHOOL_SUSPENDED' };
  }
  if (school) {
    const access = evaluateOfflineSubscriptionAccess(school, now);
    if (!access.hasAccess) {
      audit('LOGIN_FAILED', null, { email: input.email.toLowerCase(), reason: 'subscription_expired', effectiveStatus: access.effectiveStatus });
      return { ok: false, code: 'SUBSCRIPTION_EXPIRED' };
    }
  }

  // 2. Find the user — same generic failure as a wrong password; never
  //    reveal whether an email exists (matches the online route exactly).
  const user = await repos.users.findByEmail(input.schoolId, input.email);
  if (!user) {
    audit('LOGIN_FAILED', null, { email: input.email.toLowerCase(), reason: 'no_such_user' });
    return { ok: false, code: 'INVALID_CREDENTIALS' };
  }

  if (user.status === 'pending') {
    audit('LOGIN_FAILED', user.id, { reason: 'account_pending' });
    return { ok: false, code: 'ACCOUNT_PENDING' };
  }
  if (user.status === 'inactive' || user.status === 'suspended' || user.status === 'locked') {
    audit('LOGIN_FAILED', user.id, { reason: 'account_inactive' });
    return { ok: false, code: 'ACCOUNT_INACTIVE' };
  }

  // 3. Brute-force guard, checked BEFORE bcrypt — a locked account must
  //    not get a password comparison at all (same reasoning as online).
  const lock = getOfflineLockState(user, now);
  if (lock.locked) {
    audit('LOGIN_FAILED', user.id, { reason: 'account_locked', retryAfterSec: lock.retryAfterSec });
    return { ok: false, code: 'INVALID_CREDENTIALS', retryAfterSec: lock.retryAfterSec };
  }

  // 4. Verify password.
  const isValidPassword = await bcrypt.compare(input.password, user.passwordHash);
  if (!isValidPassword) {
    const state = await registerOfflineFailedAttempt(repos.users, input.schoolId, user, now);
    audit('LOGIN_FAILED', user.id, { reason: state.locked ? 'bad_password_now_locked' : 'bad_password' });
    return { ok: false, code: 'INVALID_CREDENTIALS', ...(state.locked ? { retryAfterSec: state.retryAfterSec } : {}) };
  }

  // 5. Success — create the local session, clear lockout counters, audit.
  const session = createOfflineSession(db, {
    userId: user.id, schoolId: input.schoolId, ipAddress: input.ip ?? null, userAgent: input.userAgent ?? null,
  }, now);
  await clearOfflineFailedAttempts(repos.users, input.schoolId, user.id);
  await repos.users.recordSuccessfulLogin(input.schoolId, user.id, now.toISOString());
  audit('LOGIN', user.id, { email: input.email.toLowerCase() });

  return {
    ok: true,
    session,
    user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, mustChangePassword: user.mustChangePassword },
  };
}
