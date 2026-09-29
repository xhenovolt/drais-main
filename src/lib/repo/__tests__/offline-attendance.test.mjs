// Phase 7, sub-effort 12: the first offline-attendance slice. Real
// in-memory SQLite, no mocking — same discipline as offline-students.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import { listOfflineAttendanceForDate, getOfflinePersonAttendance } from '@/lib/repo/offline-attendance';

describe('offline-attendance', () => {
  let db, repos, schoolId, otherSchoolId, alice, bob;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'Offline Attendance School' });
    schoolId = school.id;
    const other = await repos.schools.create({ name: 'A Different School' });
    otherSchoolId = other.id;

    alice = await repos.people.create({ schoolId, firstName: 'Alice', lastName: 'Nabirye' });
    bob = await repos.people.create({ schoolId, firstName: 'Bob', lastName: 'Okello' });

    await repos.attendanceRecords.upsert({
      schoolId, personId: alice.id, roleType: 'student', attendanceDate: '2026-09-28', status: 'present',
      firstInAt: '2026-09-28T05:00:00.000Z', lastOutAt: '2026-09-28T13:00:00.000Z',
      lateMinutes: 0, earlyMinutes: 0, totalMinutes: 480, rawEventCount: 2,
    });
    await repos.attendanceRecords.upsert({
      schoolId, personId: bob.id, roleType: 'staff', attendanceDate: '2026-09-28', status: 'late',
      firstInAt: '2026-09-28T06:30:00.000Z', lastOutAt: null,
      lateMinutes: 30, earlyMinutes: 0, totalMinutes: 0, rawEventCount: 1,
    });
    await repos.attendanceRawEvents.create({
      schoolId, deviceSn: 'GATE-1', deviceUserId: 1, personId: alice.id, roleType: 'student',
      punchAt: '2026-09-28T05:00:00.000Z', source: 'zkteco_push', matched: true,
    });
    await repos.attendanceRawEvents.create({
      schoolId, deviceSn: 'GATE-1', deviceUserId: 1, personId: alice.id, roleType: 'student',
      punchAt: '2026-09-28T13:00:00.000Z', source: 'zkteco_push', matched: true,
    });
  });

  after(() => closeSqliteDb(db));

  it('listOfflineAttendanceForDate joins each record to the person\'s name', async () => {
    const { rows } = await listOfflineAttendanceForDate(repos, schoolId, '2026-09-28');
    assert.equal(rows.length, 2);
    const aliceRow = rows.find((r) => r.personId === alice.id);
    assert.equal(aliceRow.firstName, 'Alice');
    assert.equal(aliceRow.status, 'present');
    const bobRow = rows.find((r) => r.personId === bob.id);
    assert.equal(bobRow.firstName, 'Bob');
    assert.equal(bobRow.status, 'late');
    assert.equal(bobRow.lateMinutes, 30);
  });

  it('computes an accurate status-count summary', async () => {
    const { summary } = await listOfflineAttendanceForDate(repos, schoolId, '2026-09-28');
    assert.equal(summary.total, 2);
    assert.equal(summary.present, 1);
    assert.equal(summary.late, 1);
    assert.equal(summary.absent, 0);
    assert.equal(summary.date, '2026-09-28');
  });

  it('a date with no evaluated records returns an empty list and a zeroed summary, not an error', async () => {
    const { rows, summary } = await listOfflineAttendanceForDate(repos, schoolId, '2026-01-01');
    assert.deepEqual(rows, []);
    assert.equal(summary.total, 0);
  });

  it('is tenant-isolated — a real check, not a formality', async () => {
    const other = await repos.people.create({ schoolId: otherSchoolId, firstName: 'Other', lastName: 'School' });
    await repos.attendanceRecords.upsert({
      schoolId: otherSchoolId, personId: other.id, roleType: 'student', attendanceDate: '2026-09-28', status: 'present',
      firstInAt: null, lastOutAt: null, lateMinutes: 0, earlyMinutes: 0, totalMinutes: 0, rawEventCount: 0,
    });
    const { rows } = await listOfflineAttendanceForDate(repos, schoolId, '2026-09-28');
    assert.ok(!rows.some((r) => r.personId === other.id), 'another school\'s record must never appear');
  });

  it('getOfflinePersonAttendance returns the person\'s evaluated days and raw punches over a range', async () => {
    const history = await getOfflinePersonAttendance(repos, schoolId, alice.id, '2026-09-01', '2026-09-30');
    assert.equal(history.firstName, 'Alice');
    assert.equal(history.days.length, 1);
    assert.equal(history.days[0].status, 'present');
    assert.equal(history.rawEvents.length, 2);
  });

  it('getOfflinePersonAttendance returns empty days/rawEvents (not null) for a person with none in range', async () => {
    const history = await getOfflinePersonAttendance(repos, schoolId, bob.id, '2026-01-01', '2026-01-31');
    assert.ok(history);
    assert.deepEqual(history.days, []);
    assert.deepEqual(history.rawEvents, []);
  });

  it('getOfflinePersonAttendance returns null for a person that does not exist', async () => {
    assert.equal(await getOfflinePersonAttendance(repos, schoolId, 999999, '2026-09-01', '2026-09-30'), null);
  });

  it('a range far longer than the 62-day cap does not throw or hang — walked only up to the cap from `from`', async () => {
    // The record lives at day 28 from `from`, comfortably inside the 62-day cap.
    const history = await getOfflinePersonAttendance(repos, schoolId, alice.id, '2026-09-01', '2030-01-01');
    assert.ok(history, 'a huge range must not throw');
    assert.equal(history.days.length, 1, 'still finds the record near the start of the walked window');
  });

  it('an inverted range (to before from) returns no days rather than throwing', async () => {
    const history = await getOfflinePersonAttendance(repos, schoolId, alice.id, '2026-09-30', '2026-09-01');
    assert.ok(history);
    assert.deepEqual(history.days, []);
  });
});
