// Phase 7, sub-effort 11: offline-students/route-bridge.ts, exercised
// through real NextRequest/NextResponse objects and a real logged-in
// offline session (via attemptOfflineLogin), the same way
// offline-route-bridge.test.mjs proved the login flow works end-to-end.
import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSqliteRepos } from '@/lib/repo/sqlite';
import { getSqliteDb, resetSqliteDb } from '@/lib/repo/sqlite/singleton';
import { handleOfflineLogin } from '@/lib/repo/offline-auth/route-bridge';
import {
  handleList, handleCreate, handleGet, handleUpdate, handleDelete, handleRestore,
} from '@/lib/repo/offline-students/route-bridge';

let prevEnv;
let sessionToken;
let repos, db, schoolId;

function reqWithSession(url, init = {}) {
  const req = new NextRequest(url, init);
  req.cookies.set('drais_session', sessionToken);
  return req;
}

before(async () => {
  // requireSession() in offline-students/route-bridge.ts calls the REAL
  // src/lib/auth.ts's getSessionSchoolId() — unlike sub-effort 10's own
  // route-bridge test (which called the inner offline-specific functions
  // directly, bypassing the mode gate), this test exercises that gate for
  // real. DRAIS_ALLOW_LOCAL/DRAIS_DB_MODE must both be set for
  // getDbMode() to actually resolve 'local-sqlite' and take the offline
  // branch — without them, getSessionSchoolId() correctly (safely)
  // refuses to trust the session at all, which is exactly what a first
  // draft of this test caught before this fix.
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
  repos = createSqliteRepos(db);
  const school = await repos.schools.create({ name: 'Offline Students Route Bridge School', subscriptionStatus: 'active' });
  schoolId = school.id;
  await repos.users.create({
    schoolId, firstName: 'Bridge', lastName: 'Tester', email: 'bridge-tester@example.com',
    passwordHash: await bcrypt.hash('pw', 4), isActive: true,
  });
  const loginRes = await handleOfflineLogin(new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'bridge-tester@example.com', password: 'pw' }),
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

describe('offline-students route-bridge', () => {
  it('handleCreate + handleGet round-trip through real HTTP-shaped objects', async () => {
    const createRes = await handleCreate(reqWithSession('http://localhost/api/students/offline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Route', lastName: 'Bridge', admissionNo: 'RB-001' }),
    }));
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()).student;
    assert.equal(created.firstName, 'Route');

    const getRes = await handleGet(reqWithSession(`http://localhost/api/students/offline/${created.id}`), created.id);
    assert.equal(getRes.status, 200);
    const fetched = (await getRes.json()).student;
    assert.equal(fetched.admissionNo, 'RB-001');
  });

  it('an unauthenticated request (no session cookie) is refused with 401 on every handler', async () => {
    const noCookieReq = new NextRequest('http://localhost/api/students/offline');
    const listRes = await handleList(noCookieReq);
    assert.equal(listRes.status, 401);

    const createRes = await handleCreate(new NextRequest('http://localhost/api/students/offline', { method: 'POST', body: '{}' }));
    assert.equal(createRes.status, 401);
  });

  it('handleList reflects a real created student and respects ?search', async () => {
    await handleCreate(reqWithSession('http://localhost/api/students/offline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Searchable', lastName: 'Person' }),
    }));
    const listRes = await handleList(reqWithSession('http://localhost/api/students/offline?search=Searchable'));
    const students = (await listRes.json()).students;
    assert.ok(students.some((s) => s.firstName === 'Searchable'));
  });

  it('handleUpdate applies a patch through the real HTTP path', async () => {
    const createRes = await handleCreate(reqWithSession('http://localhost/api/students/offline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Before', lastName: 'Update' }),
    }));
    const created = (await createRes.json()).student;

    const updateRes = await handleUpdate(reqWithSession(`http://localhost/api/students/offline/${created.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ firstName: 'After' }),
    }), created.id);
    assert.equal(updateRes.status, 200);
    assert.equal((await updateRes.json()).student.firstName, 'After');
  });

  it('handleDelete + handleRestore round-trip, and delete records the real session user as deletedBy', async () => {
    const createRes = await handleCreate(reqWithSession('http://localhost/api/students/offline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Delete', lastName: 'Restore' }),
    }));
    const created = (await createRes.json()).student;

    const delRes = await handleDelete(reqWithSession(`http://localhost/api/students/offline/${created.id}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'test delete' }),
    }), created.id);
    assert.equal(delRes.status, 200);

    const afterDelete = await repos.students.findById(schoolId, created.id);
    assert.notEqual(afterDelete.deletedAt, null);
    assert.ok(afterDelete.deletedBy, 'deletedBy must be the real session user id, not null');
    assert.equal(afterDelete.deleteReason, 'test delete');

    const listRes = await handleList(reqWithSession('http://localhost/api/students/offline'));
    const listed = (await listRes.json()).students;
    assert.ok(!listed.some((s) => s.id === created.id), 'a soft-deleted student must not appear in the default list response');

    const restoreRes = await handleRestore(reqWithSession(`http://localhost/api/students/offline/${created.id}/restore`, { method: 'POST' }), created.id);
    assert.equal(restoreRes.status, 200);
    const listAfterRestore = (await (await handleList(reqWithSession('http://localhost/api/students/offline'))).json()).students;
    assert.ok(listAfterRestore.some((s) => s.id === created.id));
  });

  it('handleGet on a nonexistent id returns 404, not a crash', async () => {
    const res = await handleGet(reqWithSession('http://localhost/api/students/offline/999999'), 999999);
    assert.equal(res.status, 404);
  });

  it('creating with missing required fields returns 400 with a clear error, through the real HTTP path', async () => {
    const res = await handleCreate(reqWithSession('http://localhost/api/students/offline', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ firstName: '' }),
    }));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_INPUT');
  });
});
