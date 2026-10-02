// Phase 7, sub-effort 17: offline-academics/route-bridge.ts, exercised
// through real NextRequest/NextResponse objects and a real logged-in
// offline session — same discipline as every prior route-bridge test.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSqliteRepos } from '@/lib/repo/sqlite';
import { getSqliteDb, resetSqliteDb } from '@/lib/repo/sqlite/singleton';
import { handleOfflineLogin } from '@/lib/repo/offline-auth/route-bridge';
import { handleList, handleGet } from '@/lib/repo/offline-academics/route-bridge';

let prevEnv;
let sessionToken;
let db, schoolId, classId;

function reqWithSession(url) {
  const req = new NextRequest(url);
  req.cookies.set('drais_session', sessionToken);
  return req;
}

before(async () => {
  prevEnv = {
    DRAIS_SQLITE_PATH: process.env.DRAIS_SQLITE_PATH,
    DRAIS_ALLOW_LOCAL: process.env.DRAIS_ALLOW_LOCAL,
    DRAIS_DB_MODE: process.env.DRAIS_DB_MODE,
  };
  process.env.DRAIS_SQLITE_PATH = ':memory:';
  process.env.DRAIS_ALLOW_LOCAL = 'true';
  process.env.DRAIS_DB_MODE = 'local-sqlite';
  resetSqliteDb();
  db = getSqliteDb();
  const repos = createSqliteRepos(db);
  const school = await repos.schools.create({ name: 'Offline Academics Route Bridge School', subscriptionStatus: 'active' });
  schoolId = school.id;
  await repos.users.create({
    schoolId, firstName: 'Bridge', lastName: 'Tester', email: 'academics-bridge-tester@example.com',
    passwordHash: await bcrypt.hash('pw', 4), isActive: true,
  });
  const cls = await repos.classes.create({ schoolId, name: 'Route Bridge Class' });
  classId = cls.id;

  const loginRes = await handleOfflineLogin(new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'academics-bridge-tester@example.com', password: 'pw' }),
  }));
  assert.equal(loginRes.status, 200, 'test setup: login must succeed to get a real session token');
  sessionToken = loginRes.cookies.get('drais_session')?.value;
  assert.ok(sessionToken);
});

after(() => {
  resetSqliteDb();
  for (const [k, v] of Object.entries(prevEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('offline-academics route-bridge', () => {
  it('handleList reflects a real created class through the real HTTP path', async () => {
    const res = await handleList(reqWithSession('http://localhost/api/academics/offline'));
    assert.equal(res.status, 200);
    const { classes } = await res.json();
    assert.ok(classes.some((c) => c.id === classId));
  });

  it('handleGet returns the class detail with empty subjects/roster when nothing is allocated yet', async () => {
    const res = await handleGet(reqWithSession(`http://localhost/api/academics/offline/${classId}`), classId);
    assert.equal(res.status, 200);
    const { class: detail } = await res.json();
    assert.equal(detail.id, classId);
    assert.deepEqual(detail.subjects, []);
    assert.deepEqual(detail.roster, []);
  });

  it('handleGet on an unknown class id returns 404, not a crash', async () => {
    const res = await handleGet(reqWithSession('http://localhost/api/academics/offline/999999'), 999999);
    assert.equal(res.status, 404);
  });

  it('an unauthenticated request (no session cookie) is refused with 401 on every handler', async () => {
    const noCookieReq = new NextRequest('http://localhost/api/academics/offline');
    const listRes = await handleList(noCookieReq);
    assert.equal(listRes.status, 401);

    const getRes = await handleGet(new NextRequest(`http://localhost/api/academics/offline/${classId}`), classId);
    assert.equal(getRes.status, 401);
  });
});
