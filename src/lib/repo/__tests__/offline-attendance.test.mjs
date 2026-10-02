// Phase 7, sub-effort 12: the first offline-attendance slice. Real
// in-memory SQLite, no mocking — same discipline as offline-students.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import {
  listOfflineAttendanceForDate, getOfflinePersonAttendance,
  recordOfflinePunch, overrideOfflineAttendanceStatus, deleteOfflineManualPunch,
} from '@/lib/repo/offline-attendance';
import { RepoError } from '@/lib/repo/contract/types';

function insertRule(db, schoolId, overrides = {}) {
  const defaults = { appliesTo: 'students', boardingScope: 'all', arrivalEndTime: '07:30:00', absenceCutoffTime: '09:00:00', lateThresholdMinutes: 15 };
  const r = { ...defaults, ...overrides };
  const res = db.prepare(
    `INSERT INTO attendance_rules (school_id, applies_to, boarding_scope, arrival_end_time, absence_cutoff_time, late_threshold_minutes, weekday_mask, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 127, 1)`, // weekday_mask 127 = every day, so test dates are never "weekend"
  ).run(schoolId, r.appliesTo, r.boardingScope, r.arrivalEndTime, r.absenceCutoffTime, r.lateThresholdMinutes);
  return Number(res.lastInsertRowid);
}

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

  describe('marking (sub-effort 19): recordOfflinePunch / overrideOfflineAttendanceStatus / deleteOfflineManualPunch', () => {
    it('recordOfflinePunch with no active rule throws INVALID_INPUT, never guesses a status', async () => {
      const noRuleSchool = (await repos.schools.create({ name: 'No Rule School' })).id;
      const person = await repos.people.create({ schoolId: noRuleSchool, firstName: 'No', lastName: 'Rule' });
      await assert.rejects(
        () => recordOfflinePunch(repos, noRuleSchool, person.id, 'student', new Date('2026-10-05T04:00:00.000Z')),
        (err) => err instanceof RepoError && err.code === 'INVALID_INPUT',
      );
    });

    it('recordOfflinePunch evaluates the real pure rule-evaluator — an on-time arrival is present', async () => {
      const ruleSchool = (await repos.schools.create({ name: 'Marking School' })).id;
      insertRule(db, ruleSchool);
      const person = await repos.people.create({ schoolId: ruleSchool, firstName: 'OnTime', lastName: 'Student' });
      // 2026-10-05 is a Monday — arrives 07:00, well inside arrival_end_time 07:30.
      const row = await recordOfflinePunch(repos, ruleSchool, person.id, 'student', new Date(2026, 9, 5, 7, 0, 0));
      assert.equal(row.status, 'present');
      assert.equal(row.lateMinutes, 0);
    });

    it('recordOfflinePunch marks late correctly using the SAME evaluate() the online engine uses', async () => {
      const ruleSchool = (await repos.schools.create({ name: 'Late Marking School' })).id;
      insertRule(db, ruleSchool);
      const person = await repos.people.create({ schoolId: ruleSchool, firstName: 'Late', lastName: 'Student' });
      // Arrives 08:00 — 30 minutes past arrival_end_time 07:30.
      const row = await recordOfflinePunch(repos, ruleSchool, person.id, 'student', new Date(2026, 9, 5, 8, 0, 0));
      assert.equal(row.status, 'late');
      assert.equal(row.lateMinutes, 30);
    });

    it('a second punch the same day re-evaluates as a full day, not two separate verdicts', async () => {
      const ruleSchool = (await repos.schools.create({ name: 'Two Punch School' })).id;
      insertRule(db, ruleSchool);
      const person = await repos.people.create({ schoolId: ruleSchool, firstName: 'Two', lastName: 'Punch' });
      await recordOfflinePunch(repos, ruleSchool, person.id, 'student', new Date(2026, 9, 5, 7, 0, 0));
      const second = await recordOfflinePunch(repos, ruleSchool, person.id, 'student', new Date(2026, 9, 5, 13, 0, 0));
      assert.equal(second.status, 'present');
      assert.ok(second.firstInAt, 'the day verdict must still reflect the FIRST punch of the day, not just the latest');
      const stillOneRecord = await repos.attendanceRecords.findByPersonAndDate(ruleSchool, person.id, '2026-10-05');
      assert.equal(stillOneRecord.rawEventCount, 2);
    });

    it('overrideOfflineAttendanceStatus (UPDATE) sets the status directly and marks the row as not rule-derived', async () => {
      const ruleSchool = (await repos.schools.create({ name: 'Override School' })).id;
      insertRule(db, ruleSchool);
      const person = await repos.people.create({ schoolId: ruleSchool, firstName: 'Override', lastName: 'Me' });
      await recordOfflinePunch(repos, ruleSchool, person.id, 'student', new Date(2026, 9, 5, 8, 0, 0)); // would be 'late'
      const overridden = await overrideOfflineAttendanceStatus(repos, ruleSchool, person.id, 'student', '2026-10-05', 'present');
      assert.equal(overridden.status, 'present');
      const record = await repos.attendanceRecords.findByPersonAndDate(ruleSchool, person.id, '2026-10-05');
      assert.equal(record.ruleId, null, 'a manually-overridden row must be distinguishable from a rule-evaluated one');
    });

    it('overrideOfflineAttendanceStatus works even with no prior record for the day', async () => {
      const ruleSchool = (await repos.schools.create({ name: 'Fresh Override School' })).id;
      const person = await repos.people.create({ schoolId: ruleSchool, firstName: 'Fresh', lastName: 'Override' });
      const row = await overrideOfflineAttendanceStatus(repos, ruleSchool, person.id, 'student', '2026-10-05', 'absent');
      assert.equal(row.status, 'absent');
    });

    it('deleteOfflineManualPunch (DELETE) removes the punch and re-evaluates — absent again once the only punch is gone', async () => {
      const ruleSchool = (await repos.schools.create({ name: 'Delete Punch School' })).id;
      insertRule(db, ruleSchool);
      const person = await repos.people.create({ schoolId: ruleSchool, firstName: 'Delete', lastName: 'Punch' });
      await recordOfflinePunch(repos, ruleSchool, person.id, 'student', new Date(2026, 9, 5, 7, 0, 0));
      const [rawEvent] = await repos.attendanceRawEvents.listByPersonAndDateRange(ruleSchool, person.id, '2026-10-05', '2026-10-05');
      assert.ok(rawEvent);

      const after = await deleteOfflineManualPunch(repos, ruleSchool, person.id, 'student', rawEvent.id);
      assert.equal(after.status, 'absent', 'with the only punch gone, the day re-evaluates to absent');
      const remaining = await repos.attendanceRawEvents.listByPersonAndDateRange(ruleSchool, person.id, '2026-10-05', '2026-10-05');
      assert.equal(remaining.length, 0);
    });

    it('deleteOfflineManualPunch refuses to delete a real device punch (not source=manual)', async () => {
      const ruleSchool = (await repos.schools.create({ name: 'Protect Device History School' })).id;
      const person = await repos.people.create({ schoolId: ruleSchool, firstName: 'Device', lastName: 'Punch' });
      const { record } = await repos.attendanceRawEvents.create({
        schoolId: ruleSchool, deviceSn: 'REAL-DEVICE-1', deviceUserId: 1, personId: person.id, roleType: 'student',
        punchAt: '2026-10-05T04:00:00.000Z', source: 'zkteco_push', matched: true,
      });
      await assert.rejects(
        () => deleteOfflineManualPunch(repos, ruleSchool, person.id, 'student', record.id),
        (err) => err instanceof RepoError && err.code === 'INVALID_INPUT',
      );
    });

    it('deleteOfflineManualPunch on an unknown raw event id throws NOT_FOUND', async () => {
      await assert.rejects(
        () => deleteOfflineManualPunch(repos, schoolId, alice.id, 'student', 999999),
        (err) => err instanceof RepoError && err.code === 'NOT_FOUND',
      );
    });
  });
});
