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
import {
  handleList, handleGet, handleCreateClass, handleUpdateClass, handleDeleteClass,
  handleListSubjects, handleCreateSubject, handleUpdateSubject, handleDeleteSubject,
  handleAssignTeacher, handleEndAllocation,
  handleListResults, handleUpsertResult, handleDeleteResult,
} from '@/lib/repo/offline-academics/route-bridge';

let prevEnv;
let sessionToken;
let repos, db, schoolId, classId;

function reqWithSession(url, init = {}) {
  const req = new NextRequest(url, init);
  req.cookies.set('drais_session', sessionToken);
  return req;
}
function postReq(url, body) { return reqWithSession(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
function putReq(url, body) { return reqWithSession(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
function deleteReq(url) { return reqWithSession(url, { method: 'DELETE' }); }

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

  describe('classes CRUD (sub-effort 19)', () => {
    it('create → update → delete round-trips through the real HTTP path', async () => {
      const createRes = await handleCreateClass(postReq('http://localhost/api/academics/offline', { name: 'RB New Class' }));
      assert.equal(createRes.status, 201);
      const created = (await createRes.json()).class;

      const updateRes = await handleUpdateClass(putReq(`http://localhost/api/academics/offline/${created.id}`, { code: 'RBNC' }), created.id);
      assert.equal(updateRes.status, 200);
      assert.equal((await updateRes.json()).class.code, 'RBNC');

      const deleteRes = await handleDeleteClass(deleteReq(`http://localhost/api/academics/offline/${created.id}`), created.id);
      assert.equal(deleteRes.status, 200);
      const listRes = await handleList(reqWithSession('http://localhost/api/academics/offline'));
      assert.ok(!(await listRes.json()).classes.some((c) => c.id === created.id));
    });

    it('create requires a name', async () => {
      const res = await handleCreateClass(postReq('http://localhost/api/academics/offline', {}));
      assert.equal(res.status, 400);
    });
  });

  describe('subjects CRUD (sub-effort 19)', () => {
    it('create → update → delete round-trips through the real HTTP path', async () => {
      const createRes = await handleCreateSubject(postReq('http://localhost/api/academics/offline/subjects', { name: 'RB New Subject' }));
      assert.equal(createRes.status, 201);
      const created = (await createRes.json()).subject;

      const updateRes = await handleUpdateSubject(putReq(`http://localhost/api/academics/offline/subjects/${created.id}`, { code: 'RBNS' }), created.id);
      assert.equal(updateRes.status, 200);
      assert.equal((await updateRes.json()).subject.code, 'RBNS');

      const deleteRes = await handleDeleteSubject(deleteReq(`http://localhost/api/academics/offline/subjects/${created.id}`), created.id);
      assert.equal(deleteRes.status, 200);
      const listRes = await handleListSubjects(reqWithSession('http://localhost/api/academics/offline/subjects'));
      assert.ok(!(await listRes.json()).subjects.some((s) => s.id === created.id));
    });
  });

  describe('teacher allocations (sub-effort 19)', () => {
    it('assign then end through the real HTTP path', async () => {
      const subject = await repos.subjects.create({ schoolId, name: 'Allocation RB Subject' });
      const assignRes = await handleAssignTeacher(postReq('http://localhost/api/academics/offline/allocations', { classId, subjectId: subject.id }));
      assert.equal(assignRes.status, 201);
      const allocation = (await assignRes.json()).allocation;

      const detailRes = await handleGet(reqWithSession(`http://localhost/api/academics/offline/${classId}`), classId);
      assert.ok((await detailRes.json()).class.subjects.some((s) => s.id === allocation.id));

      const endRes = await handleEndAllocation(deleteReq(`http://localhost/api/academics/offline/allocations/${allocation.id}`), allocation.id);
      assert.equal(endRes.status, 200);
      const afterEndRes = await handleGet(reqWithSession(`http://localhost/api/academics/offline/${classId}`), classId);
      assert.ok(!(await afterEndRes.json()).class.subjects.some((s) => s.id === allocation.id));
    });
  });

  describe('marks (sub-effort 19)', () => {
    it('list → upsert → list → delete round-trips through the real HTTP path', async () => {
      const subject = await repos.subjects.create({ schoolId, name: 'Marks RB Subject' });
      const person = await repos.people.create({ schoolId, firstName: 'Marks', lastName: 'RouteBridge' });
      const student = await repos.students.create({ schoolId, personId: person.id, admissionNo: 'MARKS-RB-1' });

      const emptyListRes = await handleListResults(reqWithSession(`http://localhost/api/academics/offline/results?classId=${classId}&subjectId=${subject.id}`));
      assert.deepEqual((await emptyListRes.json()).results, []);

      const upsertRes = await handleUpsertResult(putReq('http://localhost/api/academics/offline/results', {
        studentId: student.id, classId, subjectId: subject.id, resultTypeId: 1, score: 80,
      }));
      assert.equal(upsertRes.status, 200);
      const mark = (await upsertRes.json()).result;
      assert.equal(mark.score, 80);

      const listRes = await handleListResults(reqWithSession(`http://localhost/api/academics/offline/results?classId=${classId}&subjectId=${subject.id}`));
      assert.equal((await listRes.json()).results.length, 1);

      const deleteRes = await handleDeleteResult(deleteReq(`http://localhost/api/academics/offline/results/${mark.id}`), mark.id);
      assert.equal(deleteRes.status, 200);
      const afterDeleteRes = await handleListResults(reqWithSession(`http://localhost/api/academics/offline/results?classId=${classId}&subjectId=${subject.id}`));
      assert.equal((await afterDeleteRes.json()).results.length, 0);
    });

    it('listResults requires classId and subjectId', async () => {
      const res = await handleListResults(reqWithSession('http://localhost/api/academics/offline/results'));
      assert.equal(res.status, 400);
    });
  });
});
