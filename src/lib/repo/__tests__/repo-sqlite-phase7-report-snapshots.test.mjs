// Phase 7, sub-effort 20: report_snapshots. Read-only repo (no create() on
// the contract — provisioning writes via seedReportSnapshot, tested
// separately), so fixtures are inserted directly, same pattern as the
// enrollments test file for the same reason.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';

function insertSnapshot(db, { schoolId, snapshotId, type = 'secular', termId = 1, yearId = 1, resultTypeId = null, status = 'ready', classCount = 1, studentCount = 1, resultCount = 1, snapshotJson = null }) {
  db.prepare(
    `INSERT INTO report_snapshots (snapshot_id, school_id, type, term_id, year_id, result_type_id, status, class_count, student_count, result_count, snapshot_json)
     VALUES (@snapshotId, @schoolId, @type, @termId, @yearId, @resultTypeId, @status, @classCount, @studentCount, @resultCount, @snapshotJson)`,
  ).run({ snapshotId, schoolId, type, termId, yearId, resultTypeId, status, classCount, studentCount, resultCount, snapshotJson });
}

describe('repo-sqlite: Phase 7 sub-effort 20 (report_snapshots)', () => {
  let db, repos, schoolId, otherSchoolId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    schoolId = (await repos.schools.create({ name: 'Report Snapshot School' })).id;
    otherSchoolId = (await repos.schools.create({ name: 'A Different School' })).id;
  });

  after(() => closeSqliteDb(db));

  it('listReadyBySchool returns index rows with snapshotJson null, excluding non-ready statuses', async () => {
    insertSnapshot(db, { schoolId, snapshotId: 'snap-ready-1', status: 'ready', snapshotJson: '{"meta":{}}' });
    insertSnapshot(db, { schoolId, snapshotId: 'snap-generating-1', status: 'generating' });
    insertSnapshot(db, { schoolId, snapshotId: 'snap-failed-1', status: 'failed' });

    const list = await repos.reportSnapshots.listReadyBySchool(schoolId);
    assert.equal(list.length, 1);
    assert.equal(list[0].snapshotId, 'snap-ready-1');
    assert.equal(list[0].snapshotJson, null, 'index read must not carry the payload');
  });

  it('listReadyBySchool is tenant-scoped', async () => {
    insertSnapshot(db, { schoolId: otherSchoolId, snapshotId: 'snap-other-1', status: 'ready' });
    const list = await repos.reportSnapshots.listReadyBySchool(schoolId);
    assert.ok(!list.some((s) => s.snapshotId === 'snap-other-1'));
    const otherList = await repos.reportSnapshots.listReadyBySchool(otherSchoolId);
    assert.ok(otherList.some((s) => s.snapshotId === 'snap-other-1'));
  });

  it('findBySnapshotId returns the full record including the payload', async () => {
    insertSnapshot(db, { schoolId, snapshotId: 'snap-full-1', snapshotJson: '{"meta":{"termName":"Term 1"}}' });
    const found = await repos.reportSnapshots.findBySnapshotId(schoolId, 'snap-full-1');
    assert.equal(found.snapshotJson, '{"meta":{"termName":"Term 1"}}');
    assert.equal(found.type, 'secular');
  });

  it('findBySnapshotId is tenant-scoped — the wrong school gets null, not someone else\'s report card', async () => {
    insertSnapshot(db, { schoolId: otherSchoolId, snapshotId: 'snap-cross-tenant', snapshotJson: '{"secret":true}' });
    assert.equal(await repos.reportSnapshots.findBySnapshotId(schoolId, 'snap-cross-tenant'), null);
    assert.ok(await repos.reportSnapshots.findBySnapshotId(otherSchoolId, 'snap-cross-tenant'));
  });

  it('findBySnapshotId on an unknown id returns null, not an error', async () => {
    assert.equal(await repos.reportSnapshots.findBySnapshotId(schoolId, 'does-not-exist'), null);
  });

  it('findBySnapshotId still resolves a non-ready snapshot (e.g. generating or failed) — the status itself is the caller\'s signal, not a filter here', async () => {
    insertSnapshot(db, { schoolId, snapshotId: 'snap-failed-lookup', status: 'failed' });
    const found = await repos.reportSnapshots.findBySnapshotId(schoolId, 'snap-failed-lookup');
    assert.equal(found.status, 'failed');
  });
});
