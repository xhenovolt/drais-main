// Phase 7 tests: people, attendance_raw_events, attendance_records.
// Same in-memory, real-SQLite approach as repo-sqlite.test.mjs — see that
// file's header and contract-assertions.mjs for the stated, deliberate
// gap this shares (no live MySQL to test repo-mysql against).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';

describe('repo-sqlite: Phase 7 (people, attendance)', () => {
  let db, repos, schoolId, personId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'Phase 7 Test School' });
    schoolId = school.id;
    const person = await repos.people.create({ schoolId, firstName: 'Amina', lastName: 'Nakato' });
    personId = person.id;
  });

  after(() => {
    closeSqliteDb(db);
  });

  describe('PersonRepo', () => {
    it('create/findById round-trip, and a field left off input stays null', async () => {
      const p = await repos.people.create({ schoolId, firstName: 'John', lastName: 'Okello' });
      assert.equal(p.firstName, 'John');
      assert.equal(p.otherName, null);
      const found = await repos.people.findById(p.id);
      assert.deepEqual(found, p);
    });

    it('update() applies an explicit null, not silently ignores it (the bug found while building this)', async () => {
      const p = await repos.people.create({ schoolId, firstName: 'Grace', lastName: 'Auma', phone: '+256700000001' });
      assert.equal(p.phone, '+256700000001');
      const cleared = await repos.people.update(p.id, { phone: null });
      assert.equal(cleared.phone, null, 'explicitly clearing a field to null must actually clear it');
      // And a field simply left off a later update() call is untouched.
      const untouched = await repos.people.update(p.id, { gender: 'female' });
      assert.equal(untouched.firstName, 'Grace', 'fields not mentioned in the patch must survive unchanged');
    });

    it('softDelete tombstones but findById still finds it directly', async () => {
      const p = await repos.people.create({ schoolId, firstName: 'Temp', lastName: 'Person' });
      await repos.people.softDelete(p.id);
      const found = await repos.people.findById(p.id);
      assert.notEqual(found?.deletedAt, null);
    });
  });

  describe('AttendanceRawEventRepo', () => {
    it('create() is idempotent on the real dedup key — a duplicate resolves, does not throw or double-insert', async () => {
      const input = {
        schoolId, deviceSn: 'ZK-TEST-01', deviceUserId: 42, personId, roleType: 'student',
        punchAt: '2026-08-20T06:30:00.000Z', source: 'tcp_pull', matched: true,
      };
      const first = await repos.attendanceRawEvents.create(input);
      assert.equal(first.inserted, true);

      const second = await repos.attendanceRawEvents.create(input); // exact same dedup key
      assert.equal(second.inserted, false, 'a duplicate must not insert a second row');
      assert.equal(second.record.id, first.record.id, 'the resolved record must be the SAME row, not a new one');
    });

    it('a different punch_at (even same device+pin) is a genuinely new row, not deduped', async () => {
      const base = { schoolId, deviceSn: 'ZK-TEST-02', deviceUserId: 7, source: 'tcp_pull' };
      const a = await repos.attendanceRawEvents.create({ ...base, punchAt: '2026-08-20T07:00:00.000Z' });
      const b = await repos.attendanceRawEvents.create({ ...base, punchAt: '2026-08-20T07:01:00.000Z' });
      assert.equal(a.inserted, true);
      assert.equal(b.inserted, true);
      assert.notEqual(a.record.id, b.record.id);
    });

    it('listByPersonAndDateRange returns only that person, ordered by time, within range', async () => {
      const p2 = await repos.people.create({ schoolId, firstName: 'Other', lastName: 'Person' });
      await repos.attendanceRawEvents.create({ schoolId, deviceSn: 'ZK-RANGE', deviceUserId: 99, personId: p2.id, punchAt: '2026-08-21T08:00:00.000Z', source: 'tcp_pull' });
      await repos.attendanceRawEvents.create({ schoolId, deviceSn: 'ZK-RANGE', deviceUserId: 1, personId, punchAt: '2026-08-21T08:05:00.000Z', source: 'tcp_pull' });
      await repos.attendanceRawEvents.create({ schoolId, deviceSn: 'ZK-RANGE', deviceUserId: 1, personId, punchAt: '2026-08-21T16:00:00.000Z', source: 'tcp_pull' });
      await repos.attendanceRawEvents.create({ schoolId, deviceSn: 'ZK-RANGE', deviceUserId: 1, personId, punchAt: '2026-09-05T08:00:00.000Z', source: 'tcp_pull' }); // outside range

      const events = await repos.attendanceRawEvents.listByPersonAndDateRange(schoolId, personId, '2026-08-21', '2026-08-21');
      assert.equal(events.length, 2, 'must not include the other person\'s row or the out-of-range row');
      assert.ok(events[0].punchAt < events[1].punchAt, 'must be ordered earliest-first');
    });
  });

  describe('AttendanceRecordRepo', () => {
    it('upsert() creates on first call, updates the SAME row on a second call for the same person+date', async () => {
      const first = await repos.attendanceRecords.upsert({
        schoolId, personId, roleType: 'student', attendanceDate: '2026-08-20',
        status: 'present', firstInAt: '2026-08-20T06:30:00.000Z', rawEventCount: 1,
      });
      assert.equal(first.status, 'present');
      assert.equal(first.rawEventCount, 1);

      const second = await repos.attendanceRecords.upsert({
        schoolId, personId, roleType: 'student', attendanceDate: '2026-08-20',
        status: 'late', firstInAt: '2026-08-20T06:30:00.000Z', lastOutAt: '2026-08-20T15:00:00.000Z', rawEventCount: 2,
      });
      assert.equal(second.id, first.id, 'must be the same row, not a duplicate');
      assert.equal(second.status, 'late', 're-evaluating the day must update the status');
      assert.equal(second.rawEventCount, 2);
    });

    it('findByPersonAndDate / listBySchoolAndDate reflect the upserted rows', async () => {
      const p2 = await repos.people.create({ schoolId, firstName: 'Third', lastName: 'Person' });
      await repos.attendanceRecords.upsert({ schoolId, personId: p2.id, roleType: 'student', attendanceDate: '2026-08-22', status: 'absent' });

      const found = await repos.attendanceRecords.findByPersonAndDate(schoolId, p2.id, '2026-08-22');
      assert.equal(found?.status, 'absent');

      const dayList = await repos.attendanceRecords.listBySchoolAndDate(schoolId, '2026-08-22');
      assert.ok(dayList.some((r) => r.personId === p2.id));
    });
  });
});
