// Phase 7, sub-effort 8: the complete offline login flow — lockout,
// audit, session creation, and attemptOfflineLogin() end-to-end. Real
// in-memory SQLite, real bcrypt hashes, no mocking.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import {
  getOfflineLockState, registerOfflineFailedAttempt, clearOfflineFailedAttempts,
  LOCKOUT_THRESHOLD, LOCKOUT_WINDOW_MIN,
} from '@/lib/repo/offline-auth/lockout';
import { appendOfflineAuditEvent, listUnsyncedOfflineAuditEvents, markOfflineAuditEventsSynced } from '@/lib/repo/offline-auth/audit';
import { createOfflineSession, findActiveOfflineSession, endOfflineSession } from '@/lib/repo/offline-auth/session';
import { attemptOfflineLogin } from '@/lib/repo/offline-auth/login';

describe('offline-auth: lockout', () => {
  let db, repos, schoolId, user;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'Lockout Test School' });
    schoolId = school.id;
  });

  after(() => closeSqliteDb(db));

  beforeEach(async () => {
    user = await repos.users.create({
      schoolId, firstName: 'Lock', lastName: 'Test',
      email: `lock-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'x',
    });
  });

  it('an unlocked account (never failed) has no lock state', () => {
    const state = getOfflineLockState(user);
    assert.equal(state.locked, false);
  });

  it('crossing the threshold locks the account with a real cooldown', async () => {
    let state;
    let current = user;
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      state = await registerOfflineFailedAttempt(repos.users, schoolId, current);
      current = await repos.users.findById(schoolId, user.id); // re-fetch — attempts/lockedUntil are read fresh each time, mirroring a real request cycle
    }
    assert.equal(state.locked, true, `the ${LOCKOUT_THRESHOLD}th failure must trigger a lock`);
    assert.ok(state.retryAfterSec > 0);

    const persisted = await repos.users.findById(schoolId, user.id);
    assert.equal(persisted.failedLoginAttempts, LOCKOUT_THRESHOLD);
    assert.ok(persisted.lockedUntil);

    const checked = getOfflineLockState(persisted);
    assert.equal(checked.locked, true, 'getOfflineLockState must independently agree the account is locked');
  });

  it('a cooldown that has already elapsed reads as unlocked, not stuck locked forever', async () => {
    // Simulate a lockedUntil in the past directly via recordFailedLogin.
    await repos.users.recordFailedLogin(schoolId, user.id, {
      failedLoginAttempts: LOCKOUT_THRESHOLD, lockedUntil: new Date(Date.now() - 1000).toISOString(),
      lastFailedLoginAt: new Date().toISOString(),
    });
    const persisted = await repos.users.findById(schoolId, user.id);
    const state = getOfflineLockState(persisted);
    assert.equal(state.locked, false, 'an elapsed cooldown must not be reported as still locked');
  });

  it('a failure outside the window resets the count, not accumulates it', async () => {
    const staleFailure = new Date(Date.now() - (LOCKOUT_WINDOW_MIN + 1) * 60 * 1000);
    await repos.users.recordFailedLogin(schoolId, user.id, {
      failedLoginAttempts: LOCKOUT_THRESHOLD - 1, lockedUntil: null, lastFailedLoginAt: staleFailure.toISOString(),
    });
    const stale = await repos.users.findById(schoolId, user.id);
    const state = await registerOfflineFailedAttempt(repos.users, schoolId, stale);
    assert.equal(state.locked, false, 'one failure after a stale window must not immediately lock');
    const persisted = await repos.users.findById(schoolId, user.id);
    assert.equal(persisted.failedLoginAttempts, 1, 'the count must have reset to 1, not continued from LOCKOUT_THRESHOLD-1');
  });

  it('clearOfflineFailedAttempts resets everything', async () => {
    await repos.users.recordFailedLogin(schoolId, user.id, {
      failedLoginAttempts: 3, lockedUntil: null, lastFailedLoginAt: new Date().toISOString(),
    });
    await clearOfflineFailedAttempts(repos.users, schoolId, user.id);
    const persisted = await repos.users.findById(schoolId, user.id);
    assert.equal(persisted.failedLoginAttempts, 0);
    assert.equal(persisted.lockedUntil, null);
    assert.equal(persisted.lastFailedLoginAt, null);
  });
});

describe('offline-auth: audit', () => {
  let db;
  before(() => { db = openSqliteDb(':memory:'); });
  after(() => closeSqliteDb(db));

  it('appendOfflineAuditEvent writes a row that listUnsyncedOfflineAuditEvents finds', () => {
    appendOfflineAuditEvent(db, { schoolId: 1, userId: 5, action: 'LOGIN', details: { email: 'a@b.com' } });
    const unsynced = listUnsyncedOfflineAuditEvents(db);
    assert.equal(unsynced.length, 1);
    assert.equal(unsynced[0].action, 'LOGIN');
    assert.deepEqual(unsynced[0].details, { email: 'a@b.com' });
    assert.equal(unsynced[0].syncedAt, null);
  });

  it('markOfflineAuditEventsSynced removes rows from the unsynced list', () => {
    const before = listUnsyncedOfflineAuditEvents(db);
    markOfflineAuditEventsSynced(db, before.map((r) => r.id));
    const after = listUnsyncedOfflineAuditEvents(db);
    assert.equal(after.length, 0);
  });

  it('never throws even with a pathological details object', () => {
    assert.doesNotThrow(() => {
      const circular = {}; circular.self = circular;
      appendOfflineAuditEvent(db, { schoolId: 1, userId: null, action: 'LOGIN_FAILED', details: circular });
    });
  });
});

describe('offline-auth: session', () => {
  let db, repos, schoolId, userId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'Session Test School' });
    schoolId = school.id;
    const user = await repos.users.create({ schoolId, firstName: 'S', lastName: 'U', email: 'session-user@example.com', passwordHash: 'x' });
    userId = user.id;
  });

  after(() => closeSqliteDb(db));

  it('createOfflineSession produces a real, findable, unexpired session', () => {
    const session = createOfflineSession(db, { userId, schoolId });
    assert.ok(session.sessionToken.length >= 32);
    const found = findActiveOfflineSession(db, session.sessionToken);
    assert.equal(found?.id, session.id);
  });

  it('endOfflineSession deactivates it — no longer findable as active', () => {
    const session = createOfflineSession(db, { userId, schoolId });
    endOfflineSession(db, session.sessionToken);
    const found = findActiveOfflineSession(db, session.sessionToken);
    assert.equal(found, null);
  });

  it('an expired session is not found as active even if is_active=1', () => {
    const session = createOfflineSession(db, { userId, schoolId, expiresInMs: -1000 });
    const found = findActiveOfflineSession(db, session.sessionToken);
    assert.equal(found, null, 'an already-expired session must not be usable');
  });

  it('FOREIGN KEY constraint genuinely rejects a session for a non-existent user — not a formality', () => {
    assert.throws(() => createOfflineSession(db, { userId: 999999, schoolId }));
  });
});

describe('offline-auth: attemptOfflineLogin — end-to-end', () => {
  let db, repos, schoolId, plainPassword, user;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({
      name: 'Login E2E School', subscriptionStatus: 'active',
      subscriptionEndDate: new Date(Date.now() + 365 * 86400_000).toISOString(),
    });
    schoolId = school.id;
    plainPassword = 'correct horse battery staple';
    user = await repos.users.create({
      schoolId, firstName: 'Real', lastName: 'User', email: 'real.user@example.com',
      passwordHash: await bcrypt.hash(plainPassword, 4), // low cost factor — tests only
      isActive: true,
    });
  });

  after(() => closeSqliteDb(db));

  it('correct credentials succeed: real session, cleared lockout, LOGIN audited', async () => {
    const result = await attemptOfflineLogin(db, repos, { email: 'real.user@example.com', password: plainPassword, schoolId });
    assert.equal(result.ok, true);
    assert.ok(result.session.sessionToken);
    assert.equal(result.user.email, 'real.user@example.com');

    const found = findActiveOfflineSession(db, result.session.sessionToken);
    assert.equal(found?.userId, user.id);

    const events = listUnsyncedOfflineAuditEvents(db);
    assert.ok(events.some((e) => e.action === 'LOGIN' && e.userId === user.id));
  });

  it('wrong password fails generically and registers a failed attempt', async () => {
    const result = await attemptOfflineLogin(db, repos, { email: 'real.user@example.com', password: 'wrong', schoolId });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_CREDENTIALS');
    const persisted = await repos.users.findById(schoolId, user.id);
    assert.equal(persisted.failedLoginAttempts, 1);
  });

  it('a non-existent email fails with the SAME generic code as a wrong password — no user enumeration', async () => {
    const result = await attemptOfflineLogin(db, repos, { email: 'nobody@example.com', password: 'whatever', schoolId });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_CREDENTIALS');
  });

  it('crossing the lockout threshold blocks even a CORRECT password — a locked account gets no bcrypt comparison', async () => {
    const lockedUser = await repos.users.create({
      schoolId, firstName: 'Soon', lastName: 'Locked', email: 'soon.locked@example.com',
      passwordHash: await bcrypt.hash('rightpassword', 4), isActive: true,
    });
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      await attemptOfflineLogin(db, repos, { email: 'soon.locked@example.com', password: 'wrongpassword', schoolId });
    }
    const result = await attemptOfflineLogin(db, repos, { email: 'soon.locked@example.com', password: 'rightpassword', schoolId });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'INVALID_CREDENTIALS', 'a locked account must report the SAME code as a wrong password, never a distinct "locked" code');
    assert.ok(result.retryAfterSec > 0);
  });

  it('an inactive account is refused even with the correct password', async () => {
    const inactiveUser = await repos.users.create({
      schoolId, firstName: 'In', lastName: 'Active', email: 'inactive@example.com',
      passwordHash: await bcrypt.hash('pw', 4), status: 'inactive',
    });
    const result = await attemptOfflineLogin(db, repos, { email: 'inactive@example.com', password: 'pw', schoolId });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ACCOUNT_INACTIVE');
  });

  it('a suspended school refuses login before even checking the user', async () => {
    const otherSchool = await repos.schools.create({ name: 'Suspended School', status: 'suspended' });
    await repos.users.create({
      schoolId: otherSchool.id, firstName: 'A', lastName: 'B', email: 'user@suspended.com',
      passwordHash: await bcrypt.hash('pw', 4),
    });
    const result = await attemptOfflineLogin(db, repos, { email: 'user@suspended.com', password: 'pw', schoolId: otherSchool.id });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'SCHOOL_SUSPENDED');
  });

  it('a lapsed carried subscription refuses login — the actual point of sub-effort 7', async () => {
    const lapsedSchool = await repos.schools.create({
      name: 'Lapsed School', subscriptionStatus: 'trial',
      trialEndDate: new Date(Date.now() - 30 * 86400_000).toISOString(), // 30 days ago
    });
    await repos.users.create({
      schoolId: lapsedSchool.id, firstName: 'A', lastName: 'B', email: 'user@lapsed.com',
      passwordHash: await bcrypt.hash('pw', 4),
    });
    const result = await attemptOfflineLogin(db, repos, { email: 'user@lapsed.com', password: 'pw', schoolId: lapsedSchool.id });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'SUBSCRIPTION_EXPIRED');
  });
});
