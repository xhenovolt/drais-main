// Phase 7, sub-effort 12: offline-attendance/route-bridge.ts, exercised
// through real NextRequest/NextResponse objects and a real logged-in
// offline session — same discipline as offline-students-route-bridge.test.mjs.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { createSqliteRepos } from '@/lib/repo/sqlite';
import { getSqliteDb, resetSqliteDb } from '@/lib/repo/sqlite/singleton';
import { handleOfflineLogin } from '@/lib/repo/offline-auth/route-bridge';
import {
  handleForDate, handleForPerson, handleRecordPunch, handleOverrideStatus, handleDeleteManualPunch,
} from '@/lib/repo/offline-attendance/route-bridge';

let prevEnv;
let sessionToken;
let repos, db, schoolId, alice;

function postReq(url, body) {
  const req = new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  req.cookies.set('drais_session', sessionToken);
  return req;
}
function putReq(url, body) {
  const req = new NextRequest(url, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  req.cookies.set('drais_session', sessionToken);
  return req;
}

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
  repos = createSqliteRepos(db);
  const school = await repos.schools.create({ name: 'Offline Attendance Route Bridge School', subscriptionStatus: 'active' });
  schoolId = school.id;
  await repos.users.create({
    schoolId, firstName: 'Bridge', lastName: 'Tester', email: 'attn-bridge-tester@example.com',
    passwordHash: await bcrypt.hash('pw', 4), isActive: true,
  });
  alice = await repos.people.create({ schoolId, firstName: 'Alice', lastName: 'Nabirye' });
  await repos.attendanceRecords.upsert({
    schoolId, personId: alice.id, roleType: 'student', attendanceDate: '2026-09-28', status: 'present',
    firstInAt: '2026-09-28T05:00:00.000Z', lastOutAt: '2026-09-28T13:00:00.000Z',
    lateMinutes: 0, earlyMinutes: 0, totalMinutes: 480, rawEventCount: 1,
  });

  const loginRes = await handleOfflineLogin(new NextRequest('http://localhost/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'attn-bridge-tester@example.com', password: 'pw' }),
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

describe('offline-attendance route-bridge', () => {
  it('handleForDate returns the real seeded row and summary through a real HTTP-shaped object', async () => {
    const res = await handleForDate(reqWithSession('http://localhost/api/attendance/offline?date=2026-09-28'));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.rows.length, 1);
    assert.equal(body.rows[0].firstName, 'Alice');
    assert.equal(body.summary.present, 1);
  });

  it('defaults to today when no ?date is given, rather than erroring', async () => {
    const res = await handleForDate(reqWithSession('http://localhost/api/attendance/offline'));
    assert.equal(res.status, 200);
  });

  it('rejects a malformed date with 400, not a silent empty result', async () => {
    const res = await handleForDate(reqWithSession('http://localhost/api/attendance/offline?date=not-a-date'));
    assert.equal(res.status, 400);
  });

  it('an unauthenticated request is refused with 401', async () => {
    const res = await handleForDate(new NextRequest('http://localhost/api/attendance/offline?date=2026-09-28'));
    assert.equal(res.status, 401);
  });

  it('handleForPerson returns real history through a real HTTP-shaped object', async () => {
    const res = await handleForPerson(
      reqWithSession(`http://localhost/api/attendance/offline/person/${alice.id}?from=2026-09-01&to=2026-09-30`),
      alice.id,
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.history.days.length, 1);
    assert.equal(body.history.days[0].status, 'present');
  });

  it('handleForPerson 404s for a person that does not exist', async () => {
    const res = await handleForPerson(reqWithSession('http://localhost/api/attendance/offline/person/999999'), 999999);
    assert.equal(res.status, 404);
  });

  describe('marking (sub-effort 19)', () => {
    let bob;

    before(async () => {
      bob = await repos.people.create({ schoolId, firstName: 'Bob', lastName: 'Okello' });
      db.prepare(
        `INSERT INTO attendance_rules (school_id, applies_to, boarding_scope, arrival_end_time, late_threshold_minutes, weekday_mask, is_active)
         VALUES (?, 'students', 'all', '07:30:00', 15, 127, 1)`,
      ).run(schoolId);
    });

    it('handleRecordPunch records a punch and returns the evaluated row through the real HTTP path', async () => {
      const res = await handleRecordPunch(postReq('http://localhost/api/attendance/offline/punch', {
        personId: bob.id, roleType: 'student', punchAt: '2026-10-05T04:00:00.000Z',
      }));
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.ok(['present', 'late'].includes(body.row.status));
    });

    it('handleRecordPunch requires personId and roleType', async () => {
      const res = await handleRecordPunch(postReq('http://localhost/api/attendance/offline/punch', { roleType: 'student' }));
      assert.equal(res.status, 400);
    });

    it('handleRecordPunch is refused unauthenticated', async () => {
      const req = new NextRequest('http://localhost/api/attendance/offline/punch', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ personId: bob.id, roleType: 'student' }),
      });
      const res = await handleRecordPunch(req);
      assert.equal(res.status, 401);
    });

    it('handleOverrideStatus sets the status directly through the real HTTP path', async () => {
      const res = await handleOverrideStatus(putReq('http://localhost/api/attendance/offline/status', {
        personId: bob.id, roleType: 'student', date: '2026-10-06', status: 'absent',
      }));
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.row.status, 'absent');
    });

    it('handleOverrideStatus rejects an invalid status', async () => {
      const res = await handleOverrideStatus(putReq('http://localhost/api/attendance/offline/status', {
        personId: bob.id, roleType: 'student', date: '2026-10-06', status: 'not-a-real-status',
      }));
      assert.equal(res.status, 400);
    });

    it('handleDeleteManualPunch removes the punch and re-evaluates through the real HTTP path', async () => {
      await handleRecordPunch(postReq('http://localhost/api/attendance/offline/punch', {
        personId: bob.id, roleType: 'student', punchAt: '2026-10-07T04:00:00.000Z',
      }));
      const [rawEvent] = await repos.attendanceRawEvents.listByPersonAndDateRange(schoolId, bob.id, '2026-10-07', '2026-10-07');
      assert.ok(rawEvent);

      const delReq = reqWithSession(`http://localhost/api/attendance/offline/punch/${rawEvent.id}?personId=${bob.id}&roleType=student`);
      const res = await handleDeleteManualPunch(delReq, rawEvent.id);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.row.status, 'absent');
    });

    it('handleDeleteManualPunch requires personId and roleType query params', async () => {
      const res = await handleDeleteManualPunch(reqWithSession('http://localhost/api/attendance/offline/punch/1'), 1);
      assert.equal(res.status, 400);
    });

    it('handleDeleteManualPunch rejects a missing ?personId specifically, not just both missing — a real bug (Number(null) is 0, which is finite) caught here, not assumed away', async () => {
      const res = await handleDeleteManualPunch(reqWithSession('http://localhost/api/attendance/offline/punch/1?roleType=student'), 1);
      assert.equal(res.status, 400);
    });
  });
});
