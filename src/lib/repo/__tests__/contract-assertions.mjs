// Shared contract test suite — the SAME assertions are meant to run
// against every repo-* implementation (mysql, sqlite, and any future
// engine), per docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §25 Phase
// 3's completion criteria: "the same contract test suite runs against
// both repo-mysql and repo-sqlite; green on both is the phase's core
// deliverable."
//
// Only the SQLite side is actually wired up to run in this repo today
// (repo-sqlite.test.mjs) — there is no isolated MySQL/TiDB test database
// available in this environment, and this suite deliberately does not
// connect to the real production TiDB Cloud database to "test" against it.
// That is a genuine, stated gap (see docs/architecture/
// DRAIS_V2_ARCHITECTURE_AUDIT.md's Phase 3 completion note), not a claim
// of parity this file doesn't actually back up. Wire a repo-mysql run of
// this exact function up against a real local/dev MySQL instance before
// treating "both green" as true.
import assert from 'node:assert/strict';

/**
 * @param {import('node:test').TestContext} t
 * @param {import('../contract').Repos} repos
 * @param {number} schoolId - a school id that already exists for the repo
 *   under test (the caller creates it first via repos.schools.create()).
 */
export async function runRepoContractSuite(t, repos, schoolId) {
  await t.test('student create/findById round-trip', async () => {
    const created = await repos.students.create({
      schoolId, personId: 9001, admissionNo: `PARITY-${Date.now()}-A`, status: 'active',
    });
    assert.equal(created.schoolId, schoolId);
    assert.equal(created.personId, 9001);
    assert.equal(created.status, 'active');
    assert.equal(created.deletedAt, null);

    const found = await repos.students.findById(schoolId, created.id);
    assert.deepEqual(found, created);
  });

  await t.test('findByAdmissionNo finds the right row, not just any row', async () => {
    const admissionNo = `PARITY-${Date.now()}-B`;
    const created = await repos.students.create({ schoolId, personId: 9002, admissionNo });
    const found = await repos.students.findByAdmissionNo(schoolId, admissionNo);
    assert.equal(found?.id, created.id);
    const miss = await repos.students.findByAdmissionNo(schoolId, `${admissionNo}-does-not-exist`);
    assert.equal(miss, null);
  });

  await t.test('update merges only the given fields, leaves the rest alone', async () => {
    const created = await repos.students.create({ schoolId, personId: 9003, notes: 'original note' });
    const updated = await repos.students.update(schoolId, created.id, { status: 'inactive' });
    assert.equal(updated.status, 'inactive');
    assert.equal(updated.notes, 'original note'); // untouched field survives
    assert.equal(updated.personId, 9003); // untouched field survives
  });

  await t.test('softDelete hides the row from listBySchool by default, not from findById', async () => {
    const created = await repos.students.create({ schoolId, personId: 9004 });
    await repos.students.softDelete(schoolId, created.id);
    const found = await repos.students.findById(schoolId, created.id);
    assert.notEqual(found?.deletedAt, null); // still findable directly, but tombstoned

    const list = await repos.students.listBySchool(schoolId, { limit: 1000 });
    assert.ok(!list.some(s => s.id === created.id), 'soft-deleted student leaked into the default list');

    const listWithDeleted = await repos.students.listBySchool(schoolId, { limit: 1000, includeDeleted: true });
    assert.ok(listWithDeleted.some(s => s.id === created.id), 'includeDeleted:true should surface tombstoned rows');
  });

  await t.test('softDelete on an already-deleted row throws NOT_FOUND, not a silent no-op', async () => {
    const created = await repos.students.create({ schoolId, personId: 9005 });
    await repos.students.softDelete(schoolId, created.id);
    await assert.rejects(() => repos.students.softDelete(schoolId, created.id), /not found|already deleted/i);
  });

  await t.test('findById is school-scoped — a real tenant-isolation check, not a formality', async () => {
    const created = await repos.students.create({ schoolId, personId: 9006 });
    const wrongSchoolId = schoolId + 999999;
    const found = await repos.students.findById(wrongSchoolId, created.id);
    assert.equal(found, null, 'a student must not be findable under a different school_id');
  });

  await t.test('school update round-trips through findById', async () => {
    const updated = await repos.schools.update(schoolId, { phone: '+256700000000' });
    assert.equal(updated.phone, '+256700000000');
    const found = await repos.schools.findById(schoolId);
    assert.equal(found?.phone, '+256700000000');
  });
}
