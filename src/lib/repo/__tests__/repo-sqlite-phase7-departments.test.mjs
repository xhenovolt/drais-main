// Phase 7, sub-effort 16: departments. Full CRUD, same shape as classes/
// staff — plain reference data, no invented business logic.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import { RepoError } from '@/lib/repo/contract/types';

describe('repo-sqlite: Phase 7 sub-effort 16 (departments)', () => {
  let db, repos, schoolId, otherSchoolId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    schoolId = (await repos.schools.create({ name: 'Department Test School' })).id;
    otherSchoolId = (await repos.schools.create({ name: 'A Different School' })).id;
  });

  after(() => closeSqliteDb(db));

  it('create/findById round-trip; subjectGroupId stays an unresolved raw integer', async () => {
    const d = await repos.departments.create({ schoolId, name: 'Sciences', subjectGroupId: 999 });
    assert.equal(d.name, 'Sciences');
    assert.equal(d.subjectGroupId, 999);
    const found = await repos.departments.findById(schoolId, d.id);
    assert.deepEqual(found, d);
  });

  it('findById is school-scoped', async () => {
    const other = await repos.departments.create({ schoolId: otherSchoolId, name: 'Other School Dept' });
    assert.equal(await repos.departments.findById(schoolId, other.id), null);
    assert.ok(await repos.departments.findById(otherSchoolId, other.id));
  });

  it('listBySchool excludes soft-deleted by default', async () => {
    const d1 = await repos.departments.create({ schoolId, name: 'List One' });
    const d2 = await repos.departments.create({ schoolId, name: 'List Two' });
    await repos.departments.softDelete(schoolId, d2.id, { deletedBy: 1 });

    const list = await repos.departments.listBySchool(schoolId);
    assert.ok(list.some((x) => x.id === d1.id));
    assert.ok(!list.some((x) => x.id === d2.id));

    const withDeleted = await repos.departments.listBySchool(schoolId, { includeDeleted: true });
    assert.ok(withDeleted.some((x) => x.id === d2.id));
  });

  it('update() applies an explicit null', async () => {
    const d = await repos.departments.create({ schoolId, name: 'Has Description', description: 'original' });
    const cleared = await repos.departments.update(schoolId, d.id, { description: null });
    assert.equal(cleared.description, null);
  });

  it('softDelete then restore round-trips the audit trail', async () => {
    const d = await repos.departments.create({ schoolId, name: 'Delete Restore' });
    await repos.departments.softDelete(schoolId, d.id, { deletedBy: 42, deleteReason: 'merged into another dept' });
    const restored = await repos.departments.restore(schoolId, d.id, 7);
    assert.equal(restored.deletedAt, null);
    assert.equal(restored.restoredBy, 7);
  });

  it('softDelete on an already-deleted row throws NOT_FOUND, not a silent no-op', async () => {
    const d = await repos.departments.create({ schoolId, name: 'Double Delete' });
    await repos.departments.softDelete(schoolId, d.id, {});
    await assert.rejects(
      () => repos.departments.softDelete(schoolId, d.id, {}),
      (err) => err instanceof RepoError && err.code === 'NOT_FOUND',
    );
  });
});
