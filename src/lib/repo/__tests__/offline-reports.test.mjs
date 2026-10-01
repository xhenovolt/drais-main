// Phase 7, sub-effort 20: the offline-reports slice. Real in-memory
// SQLite, no mocking — same discipline as every prior sub-effort.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import { listOfflineSnapshots, getOfflineSnapshot } from '@/lib/repo/offline-reports';

function insertSnapshot(db, { schoolId, snapshotId, termId = null, yearId = null, status = 'ready', snapshotJson = null }) {
  db.prepare(
    `INSERT INTO report_snapshots (snapshot_id, school_id, type, term_id, year_id, status, class_count, student_count, result_count, snapshot_json)
     VALUES (@snapshotId, @schoolId, 'secular', @termId, @yearId, @status, 1, 1, 1, @snapshotJson)`,
  ).run({ snapshotId, schoolId, termId, yearId, status, snapshotJson });
}

describe('offline-reports', () => {
  let db, repos, schoolId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    schoolId = (await repos.schools.create({ name: 'Offline Reports School' })).id;
  });

  after(() => closeSqliteDb(db));

  it('listOfflineSnapshots resolves term/year names when the local rows exist', async () => {
    const year = await repos.academicYears.create({ schoolId, name: '2026' });
    const term = await repos.terms.create({ schoolId, name: 'Term 1', academicYearId: year.id, startDate: '2026-01-01', endDate: '2026-04-01' });
    insertSnapshot(db, { schoolId, snapshotId: 'snap-with-names', termId: term.id, yearId: year.id });

    const list = await listOfflineSnapshots(repos, schoolId);
    const found = list.find((s) => s.snapshotId === 'snap-with-names');
    assert.equal(found.termName, 'Term 1');
    assert.equal(found.yearName, '2026');
  });

  it('listOfflineSnapshots resolves to null names (not a crash) when the term/year row is not on this install', async () => {
    insertSnapshot(db, { schoolId, snapshotId: 'snap-dangling-refs', termId: 999999, yearId: 999999 });
    const list = await listOfflineSnapshots(repos, schoolId);
    const found = list.find((s) => s.snapshotId === 'snap-dangling-refs');
    assert.equal(found.termName, null);
    assert.equal(found.yearName, null);
  });

  it('getOfflineSnapshot parses the stored payload into classes/students/scores', async () => {
    const payload = {
      meta: { schoolName: 'Test School', termName: 'Term 1', yearName: '2026', generatedAt: '2026-01-01T00:00:00.000Z' },
      classes: [{
        classId: 1, className: 'Senior 1', stream: 'A',
        subjects: [{ name: 'math', displayName: 'Mathematics' }],
        students: [{
          id: 's1', name: 'Amina Student', admissionNumber: 'ADM-001',
          total: 85, average: 85, position: 1,
          results: [{ subjectName: 'math', displaySubject: 'Mathematics', displayScore: '85', grade: 'A' }],
        }],
      }],
    };
    insertSnapshot(db, { schoolId, snapshotId: 'snap-parsed', snapshotJson: JSON.stringify(payload) });

    const detail = await getOfflineSnapshot(repos, schoolId, 'snap-parsed');
    assert.equal(detail.schoolName, 'Test School');
    assert.equal(detail.classes.length, 1);
    assert.equal(detail.classes[0].students[0].scores['Mathematics'].displayScore, '85');
  });

  it('getOfflineSnapshot returns null for an unknown id, not an error', async () => {
    assert.equal(await getOfflineSnapshot(repos, schoolId, 'does-not-exist'), null);
  });

  it('getOfflineSnapshot returns null, not a crash, when snapshot_json is malformed', async () => {
    insertSnapshot(db, { schoolId, snapshotId: 'snap-malformed', snapshotJson: '{not valid json' });
    assert.equal(await getOfflineSnapshot(repos, schoolId, 'snap-malformed'), null);
  });

  it('getOfflineSnapshot returns null when there is no payload at all (e.g. a generating/failed snapshot)', async () => {
    insertSnapshot(db, { schoolId, snapshotId: 'snap-no-payload', status: 'generating', snapshotJson: null });
    assert.equal(await getOfflineSnapshot(repos, schoolId, 'snap-no-payload'), null);
  });
});
