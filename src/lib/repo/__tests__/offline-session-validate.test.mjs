// Phase 7, sub-effort 9: offline session validation — the counterpart to
// src/lib/auth.ts's getSessionSchoolId(), proving a session created by
// attemptOfflineLogin() is actually usable on a LATER request, not just
// valid at the moment of login.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import { createOfflineSession, endOfflineSession } from '@/lib/repo/offline-auth/session';
import { validateOfflineSession } from '@/lib/repo/offline-auth/session-validate';

describe('offline-auth: validateOfflineSession', () => {
  let db, repos, schoolId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({
      name: 'Session Validate School', subscriptionStatus: 'active',
      subscriptionEndDate: new Date(Date.now() + 365 * 86400_000).toISOString(),
    });
    schoolId = school.id;
  });

  after(() => closeSqliteDb(db));

  it('a valid session resolves the full SessionInfo shape', async () => {
    const user = await repos.users.create({ schoolId, firstName: 'Val', lastName: 'Id', email: 'valid@example.com', passwordHash: 'x' });
    const session = createOfflineSession(db, { userId: user.id, schoolId });

    const info = await validateOfflineSession(db, repos, session.sessionToken);
    assert.equal(info?.userId, user.id);
    assert.equal(info?.schoolId, schoolId);
    assert.equal(info?.email, 'valid@example.com');
    assert.equal(info?.isSuperAdmin, false);
    assert.equal(info?.staffId, null);
  });

  it('a super_admin-slugged role correctly resolves isSuperAdmin: true', async () => {
    const user = await repos.users.create({ schoolId, firstName: 'Ad', lastName: 'Min', email: 'admin@example.com', passwordHash: 'x' });
    const role = await repos.roles.create({ schoolId, name: 'SuperAdmin', slug: 'super_admin', isActive: true });
    await repos.userRoles.assign({ userId: user.id, roleId: role.id, schoolId });
    const session = createOfflineSession(db, { userId: user.id, schoolId });

    const info = await validateOfflineSession(db, repos, session.sessionToken);
    assert.equal(info?.isSuperAdmin, true);
  });

  it('a role assignment with school_id NULL (platform-wide grant) still counts — the real gap this sub-effort fixed', async () => {
    const user = await repos.users.create({ schoolId, firstName: 'Plat', lastName: 'Form', email: 'platform@example.com', passwordHash: 'x' });
    const role = await repos.roles.create({ schoolId, name: 'Super Admin', isActive: true }); // matches by trimmed name, not slug
    await repos.userRoles.assign({ userId: user.id, roleId: role.id, schoolId: null }); // deliberately NULL
    const session = createOfflineSession(db, { userId: user.id, schoolId });

    const info = await validateOfflineSession(db, repos, session.sessionToken);
    assert.equal(info?.isSuperAdmin, true, 'a NULL-school_id role grant must still resolve as super-admin, matching online semantics');
  });

  it('a super-admin role with is_active left NULL does NOT count — mirrors the real online SQL\'s `r.is_active = TRUE` NULL-comparison semantics exactly', async () => {
    const user = await repos.users.create({ schoolId, firstName: 'Null', lastName: 'Active', email: 'nullactive@example.com', passwordHash: 'x' });
    const role = await repos.roles.create({ schoolId, name: 'SuperAdmin', slug: 'super_admin' }); // isActive deliberately unset -> NULL
    await repos.userRoles.assign({ userId: user.id, roleId: role.id, schoolId });
    const session = createOfflineSession(db, { userId: user.id, schoolId });

    const info = await validateOfflineSession(db, repos, session.sessionToken);
    assert.equal(info?.isSuperAdmin, false, 'is_active IS NULL must not satisfy the same check `= TRUE` would require online');
  });

  it('a linked staff record resolves staffId correctly', async () => {
    const person = await repos.people.create({ schoolId, firstName: 'Staff', lastName: 'Person' });
    const user = await repos.users.create({ schoolId, personId: person.id, firstName: 'Staff', lastName: 'User', email: 'staffuser@example.com', passwordHash: 'x' });
    const staff = await repos.staff.create({ schoolId, personId: person.id, staffNo: 'STF-VAL-1' });
    const session = createOfflineSession(db, { userId: user.id, schoolId });

    const info = await validateOfflineSession(db, repos, session.sessionToken);
    assert.equal(info?.staffId, staff.id);
  });

  it('an ended session no longer validates', async () => {
    const user = await repos.users.create({ schoolId, firstName: 'End', lastName: 'Ed', email: 'ended@example.com', passwordHash: 'x' });
    const session = createOfflineSession(db, { userId: user.id, schoolId });
    endOfflineSession(db, session.sessionToken);

    const info = await validateOfflineSession(db, repos, session.sessionToken);
    assert.equal(info, null);
  });

  it('an expired session no longer validates', async () => {
    const user = await repos.users.create({ schoolId, firstName: 'Exp', lastName: 'Ired', email: 'expired@example.com', passwordHash: 'x' });
    const session = createOfflineSession(db, { userId: user.id, schoolId, expiresInMs: -1000 });

    const info = await validateOfflineSession(db, repos, session.sessionToken);
    assert.equal(info, null);
  });

  it('a suspended school invalidates every session on the NEXT request, not just at login', async () => {
    const suspendable = await repos.schools.create({ name: 'Suspendable School', subscriptionStatus: 'active' });
    const user = await repos.users.create({ schoolId: suspendable.id, firstName: 'S', lastName: 'U', email: 'susp@example.com', passwordHash: 'x' });
    const session = createOfflineSession(db, { userId: user.id, schoolId: suspendable.id });

    // Session is valid right after creation...
    assert.ok(await validateOfflineSession(db, repos, session.sessionToken));

    // ...then the school is suspended while the session is still "active" in the sessions table.
    await repos.schools.update(suspendable.id, { status: 'suspended' });
    const info = await validateOfflineSession(db, repos, session.sessionToken);
    assert.equal(info, null, 'a session must be invalidated the moment its school is suspended, not remain valid until it expires');
  });

  it('a subscription that lapses mid-session invalidates it on the next request', async () => {
    const lapsing = await repos.schools.create({
      name: 'Lapsing School', subscriptionStatus: 'trial',
      trialEndDate: new Date(Date.now() + 1000).toISOString(), // valid for 1 more second
    });
    const user = await repos.users.create({ schoolId: lapsing.id, firstName: 'L', lastName: 'A', email: 'lapse@example.com', passwordHash: 'x' });
    const session = createOfflineSession(db, { userId: user.id, schoolId: lapsing.id });

    assert.ok(await validateOfflineSession(db, repos, session.sessionToken, new Date()));
    const afterExpiry = await validateOfflineSession(db, repos, session.sessionToken, new Date(Date.now() + 5000));
    assert.equal(afterExpiry, null, 'a session must be invalidated once the carried subscription snapshot lapses, even mid-session');
  });

  it('a nonexistent session token resolves null, never throws', async () => {
    const info = await validateOfflineSession(db, repos, 'not-a-real-token');
    assert.equal(info, null);
  });
});
