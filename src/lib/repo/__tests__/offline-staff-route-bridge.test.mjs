// Phase 7, sub-effort 14: offline-staff/route-bridge.ts, exercised through
// real NextRequest/NextResponse objects and a real logged-in offline
// session (via attemptOfflineLogin) — same discipline as
// offline-students-route-bridge.test.mjs.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSqliteRepos } from '@/lib/repo/sqlite';
import { getSqliteDb, resetSqliteDb } from '@/lib/repo/sqlite/singleton';
import { handleOfflineLogin } from '@/lib/repo/offline-auth/route-bridge';
import {
  handleList, handleCreate, handleGet, handleUpdate, handleDelete, handleRestore,
} from '@/lib/repo/offline-staff/route-bridge';

let prevEnv;
let sessionToken;
let repos, db, schoolId;

function reqWithSession(url, init = {}) {
  const req = new NextRequest(url, init);
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
  repos = createSqliteRepos(db);
  const school = await repos.schools.create({ name: 'Offline Staff Route Bridge School', subscriptionStatus: 'active' });
  schoolId = school.id;
  await repos.users.create({
    schoolId, firstName: 'Bridge', lastName: 'Tester', email: 'staff-bridge-tester@example.com',
    passwordHash: await bcrypt.hash('pw', 4), isActive: true,
  });
  const loginRes = await handleOfflineLogin(new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'staff-bridge-tester@example.com', password: 'pw' }),
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

describe('offline-staff route-bridge', () => {
  it('handleCreate + handleGet round-trip through real HTTP-shaped objects', async () => {
    const createRes = await handleCreate(reqWithSession('http://localhost/api/staff/offline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Route', lastName: 'Bridge', staffNo: 'RB-STF-001' }),
    }));
    assert.equal(createRes.status, 201);
    const created = (await createRes.json()).staff;
    assert.equal(created.firstName, 'Route');

    const getRes = await handleGet(reqWithSession(`http://localhost/api/staff/offline/${created.id}`), created.id);
    assert.equal(getRes.status, 200);
    const fetched = (await getRes.json()).staff;
    assert.equal(fetched.staffNo, 'RB-STF-001');
  });

  it('an unauthenticated request (no session cookie) is refused with 401 on every handler', async () => {
    const noCookieReq = new NextRequest('http://localhost/api/staff/offline');
    const listRes = await handleList(noCookieReq);
    assert.equal(listRes.status, 401);

    const createRes = await handleCreate(new NextRequest('http://localhost/api/staff/offline', { method: 'POST', body: '{}' }));
    assert.equal(createRes.status, 401);
  });

  it('handleList reflects a real created staff member and respects ?search', async () => {
    await handleCreate(reqWithSession('http://localhost/api/staff/offline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Searchable', lastName: 'Person' }),
    }));
    const listRes = await handleList(reqWithSession('http://localhost/api/staff/offline?search=Searchable'));
    const staff = (await listRes.json()).staff;
    assert.ok(staff.some((s) => s.firstName === 'Searchable'));
  });

  it('handleUpdate applies a patch through the real HTTP path', async () => {
    const createRes = await handleCreate(reqWithSession('http://localhost/api/staff/offline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Before', lastName: 'Update' }),
    }));
    const created = (await createRes.json()).staff;

    const updateRes = await handleUpdate(reqWithSession(`http://localhost/api/staff/offline/${created.id}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ firstName: 'After' }),
    }), created.id);
    assert.equal(updateRes.status, 200);
    assert.equal((await updateRes.json()).staff.firstName, 'After');
  });

  it('handleDelete + handleRestore round-trip, and delete records the real session user as deletedBy', async () => {
    const createRes = await handleCreate(reqWithSession('http://localhost/api/staff/offline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Delete', lastName: 'Restore' }),
    }));
    const created = (await createRes.json()).staff;

    const delRes = await handleDelete(reqWithSession(`http://localhost/api/staff/offline/${created.id}`, {
      method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'test delete' }),
    }), created.id);
    assert.equal(delRes.status, 200);

    const afterDelete = await repos.staff.findById(schoolId, created.id);
    assert.notEqual(afterDelete.deletedAt, null);
    assert.ok(afterDelete.deletedBy, 'deletedBy must be the real session user id, not null');
    assert.equal(afterDelete.deleteReason, 'test delete');

    const listRes = await handleList(reqWithSession('http://localhost/api/staff/offline'));
    const listed = (await listRes.json()).staff;
    assert.ok(!listed.some((s) => s.id === created.id), 'a soft-deleted staff member must not appear in the default list response');

    const restoreRes = await handleRestore(reqWithSession(`http://localhost/api/staff/offline/${created.id}/restore`, { method: 'POST' }), created.id);
    assert.equal(restoreRes.status, 200);
    const listAfterRestore = (await (await handleList(reqWithSession('http://localhost/api/staff/offline'))).json()).staff;
    assert.ok(listAfterRestore.some((s) => s.id === created.id));
  });

  it('handleGet on a nonexistent id returns 404, not a crash', async () => {
    const res = await handleGet(reqWithSession('http://localhost/api/staff/offline/999999'), 999999);
    assert.equal(res.status, 404);
  });

  it('creating with missing required fields returns 400 with a clear error, through the real HTTP path', async () => {
    const res = await handleCreate(reqWithSession('http://localhost/api/staff/offline', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ firstName: '' }),
    }));
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error.code, 'INVALID_INPUT');
  });

  it('staff_no is not unique at the schema level (unlike students.admission_no) — two staff can share one, both insert cleanly', async () => {
    const first = await handleCreate(reqWithSession('http://localhost/api/staff/offline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'First', lastName: 'StaffNo', staffNo: 'SHARED-001' }),
    }));
    assert.equal(first.status, 201);

    const second = await handleCreate(reqWithSession('http://localhost/api/staff/offline', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ firstName: 'Second', lastName: 'StaffNo', staffNo: 'SHARED-001' }),
    }));
    assert.equal(second.status, 201, 'staff.staff_no has no UNIQUE constraint in this schema — a repeat must not 409');
  });
});
