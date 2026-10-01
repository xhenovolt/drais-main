// Phase 7, sub-effort 20: offline-reports/route-bridge.ts, exercised
// through real NextRequest/NextResponse objects and a real logged-in
// offline session — same discipline as offline-students-route-bridge.test.mjs.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSqliteRepos } from '@/lib/repo/sqlite';
import { getSqliteDb, resetSqliteDb } from '@/lib/repo/sqlite/singleton';
import { handleOfflineLogin } from '@/lib/repo/offline-auth/route-bridge';
import { handleList, handleGet } from '@/lib/repo/offline-reports/route-bridge';

let prevEnv;
let sessionToken;
let db, schoolId;

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
  const school = await repos.schools.create({ name: 'Offline Reports Route Bridge School', subscriptionStatus: 'active' });
  schoolId = school.id;
  await repos.users.create({
    schoolId, firstName: 'Bridge', lastName: 'Tester', email: 'reports-bridge-tester@example.com',
    passwordHash: await bcrypt.hash('pw', 4), isActive: true,
  });
  db.prepare(
    `INSERT INTO report_snapshots (snapshot_id, school_id, type, term_id, year_id, status, class_count, student_count, result_count, snapshot_json)
     VALUES ('snap-rb-1', ?, 'secular', 1, 1, 'ready', 1, 1, 1, ?)`,
  ).run(schoolId, JSON.stringify({ meta: { termName: 'Term 1', yearName: '2026' }, classes: [] }));

  const loginRes = await handleOfflineLogin(new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'reports-bridge-tester@example.com', password: 'pw' }),
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

describe('offline-reports route-bridge', () => {
  it('handleList reflects a real stored snapshot through the real HTTP path', async () => {
    const res = await handleList(reqWithSession('http://localhost/api/reports/offline'));
    assert.equal(res.status, 200);
    const { snapshots } = await res.json();
    assert.ok(snapshots.some((s) => s.snapshotId === 'snap-rb-1'));
  });

  it('handleGet returns the parsed detail for a real snapshot', async () => {
    const res = await handleGet(reqWithSession('http://localhost/api/reports/offline/snap-rb-1'), 'snap-rb-1');
    assert.equal(res.status, 200);
    const { snapshot } = await res.json();
    assert.equal(snapshot.termName, 'Term 1');
  });

  it('handleGet on an unknown snapshot id returns 404, not a crash', async () => {
    const res = await handleGet(reqWithSession('http://localhost/api/reports/offline/does-not-exist'), 'does-not-exist');
    assert.equal(res.status, 404);
  });

  it('an unauthenticated request (no session cookie) is refused with 401 on every handler', async () => {
    const noCookieReq = new NextRequest('http://localhost/api/reports/offline');
    const listRes = await handleList(noCookieReq);
    assert.equal(listRes.status, 401);

    const getRes = await handleGet(new NextRequest('http://localhost/api/reports/offline/snap-rb-1'), 'snap-rb-1');
    assert.equal(getRes.status, 401);
  });
});
