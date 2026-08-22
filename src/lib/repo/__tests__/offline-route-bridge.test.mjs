// Phase 7, sub-effort 10: route-bridge.ts — the actual glue live routes
// will dynamically import. Exercised through real NextRequest/NextResponse
// objects, the singleton connection (reset per test via DRAIS_SQLITE_PATH
// = ':memory:'), and the real createSqliteRepos() — as close to what the
// live routes will actually do as a test can get without a running server.
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { createSqliteRepos } from '@/lib/repo/sqlite';
import { getSqliteDb, resetSqliteDb } from '@/lib/repo/sqlite/singleton';
import { getOfflineSessionInfo, handleOfflineLogin } from '@/lib/repo/offline-auth/route-bridge';

let prevPath;

beforeEach(() => {
  prevPath = process.env.DRAIS_SQLITE_PATH;
  process.env.DRAIS_SQLITE_PATH = ':memory:';
  resetSqliteDb(); // force a fresh in-memory db for every test — install.ts's one-school invariant needs isolation
});

afterEach(() => {
  resetSqliteDb();
  if (prevPath === undefined) delete process.env.DRAIS_SQLITE_PATH;
  else process.env.DRAIS_SQLITE_PATH = prevPath;
});

function loginRequest(body) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
}

function requestWithSessionCookie(token) {
  const req = new NextRequest('http://localhost/api/whatever');
  if (token) req.cookies.set('drais_session', token);
  return req;
}

describe('route-bridge: handleOfflineLogin', () => {
  it('a not-yet-provisioned install fails clearly (500, NOT_PROVISIONED), not a crash', async () => {
    const res = await handleOfflineLogin(loginRequest({ email: 'a@b.com', password: 'x' }));
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error.code, 'NOT_PROVISIONED');
  });

  it('missing credentials -> 400', async () => {
    const res = await handleOfflineLogin(loginRequest({ email: '', password: '' }));
    assert.equal(res.status, 400);
  });

  it('correct credentials succeed and set all three cookies middleware.ts reads', async () => {
    const db = getSqliteDb();
    const repos = createSqliteRepos(db);
    const bcrypt = (await import('bcryptjs')).default;
    const school = await repos.schools.create({ name: 'Bridge Test School', subscriptionStatus: 'active' });
    const role = await repos.roles.create({ schoolId: school.id, name: 'Head Teacher', isActive: true });
    const user = await repos.users.create({
      schoolId: school.id, firstName: 'Bridge', lastName: 'Test', email: 'bridge@example.com',
      passwordHash: await bcrypt.hash('correctpassword', 4), isActive: true,
    });
    await repos.userRoles.assign({ userId: user.id, roleId: role.id, schoolId: school.id });

    const res = await handleOfflineLogin(loginRequest({ email: 'bridge@example.com', password: 'correctpassword' }));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.user.roles[0], 'Head Teacher');

    const setCookies = res.cookies.getAll().map((c) => c.name);
    assert.ok(setCookies.includes('drais_session'));
    assert.ok(setCookies.includes('drais_school_id'));
    assert.ok(setCookies.includes('drais_role'));
    assert.equal(res.cookies.get('drais_school_id')?.value, String(school.id));
    assert.equal(res.cookies.get('drais_role')?.value, 'Head Teacher');
  });

  it('wrong password returns the online-matching 401/INVALID_CREDENTIALS shape', async () => {
    const db = getSqliteDb();
    const repos = createSqliteRepos(db);
    const bcrypt = (await import('bcryptjs')).default;
    const school = await repos.schools.create({ name: 'Wrong PW School', subscriptionStatus: 'active' });
    await repos.users.create({
      schoolId: school.id, firstName: 'W', lastName: 'P', email: 'wp@example.com',
      passwordHash: await bcrypt.hash('right', 4), isActive: true,
    });

    const res = await handleOfflineLogin(loginRequest({ email: 'wp@example.com', password: 'wrong' }));
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_CREDENTIALS');
  });

  it('a lapsed subscription returns the online-matching 402/SUBSCRIPTION_EXPIRED shape', async () => {
    const db = getSqliteDb();
    const repos = createSqliteRepos(db);
    const bcrypt = (await import('bcryptjs')).default;
    const school = await repos.schools.create({
      name: 'Lapsed Bridge School', subscriptionStatus: 'expired',
    });
    await repos.users.create({
      schoolId: school.id, firstName: 'E', lastName: 'X', email: 'ex@example.com',
      passwordHash: await bcrypt.hash('pw', 4), isActive: true,
    });

    const res = await handleOfflineLogin(loginRequest({ email: 'ex@example.com', password: 'pw' }));
    assert.equal(res.status, 402);
    const body = await res.json();
    assert.equal(body.error.code, 'SUBSCRIPTION_EXPIRED');
  });
});

describe('route-bridge: getOfflineSessionInfo', () => {
  it('no session cookie -> null', async () => {
    const info = await getOfflineSessionInfo(requestWithSessionCookie(undefined));
    assert.equal(info, null);
  });

  it('a real session cookie from an actual login resolves correctly', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const db = getSqliteDb();
    const repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'SessionInfo School', subscriptionStatus: 'active' });
    await repos.users.create({
      schoolId: school.id, firstName: 'Sess', lastName: 'Info', email: 'sessinfo@example.com',
      passwordHash: await bcrypt.hash('pw', 4), isActive: true,
    });

    const loginRes = await handleOfflineLogin(loginRequest({ email: 'sessinfo@example.com', password: 'pw' }));
    const token = loginRes.cookies.get('drais_session')?.value;
    assert.ok(token);

    const info = await getOfflineSessionInfo(requestWithSessionCookie(token));
    assert.equal(info?.email, 'sessinfo@example.com');
    assert.equal(info?.schoolId, school.id);
  });

  it('a bogus token resolves null, never throws', async () => {
    const info = await getOfflineSessionInfo(requestWithSessionCookie('totally-bogus-token'));
    assert.equal(info, null);
  });
});
