// Phase 7, sub-effort 14: the offline-staff slice. Real in-memory SQLite,
// no mocking — same discipline as every prior sub-effort.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import {
  listOfflineStaff, getOfflineStaff, createOfflineStaff,
  updateOfflineStaff, deleteOfflineStaff, restoreOfflineStaff,
} from '@/lib/repo/offline-staff';
import { RepoError } from '@/lib/repo/contract/types';

describe('offline-staff', () => {
  let db, repos, schoolId, otherSchoolId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'Offline Staff School' });
    schoolId = school.id;
    const other = await repos.schools.create({ name: 'A Different School' });
    otherSchoolId = other.id;
  });

  after(() => closeSqliteDb(db));

  it('create produces a real person AND staff row, joined correctly', async () => {
    const view = await createOfflineStaff(repos, schoolId, {
      firstName: 'Musoke', lastName: 'Ibrahim', staffNo: 'STF-001', position: 'Mathematics Teacher',
      employmentType: 'permanent',
    });
    assert.equal(view.firstName, 'Musoke');
    assert.equal(view.staffNo, 'STF-001');
    assert.equal(view.position, 'Mathematics Teacher');
    assert.ok(view.id);
    assert.ok(view.personId);

    const staff = await repos.staff.findById(schoolId, view.id);
    const person = await repos.people.findById(view.personId);
    assert.ok(staff);
    assert.ok(person);
    assert.equal(person.firstName, 'Musoke');
  });

  it('missing firstName/lastName is a clear INVALID_INPUT error', async () => {
    await assert.rejects(
      () => createOfflineStaff(repos, schoolId, { firstName: '', lastName: 'X' }),
      (err) => err instanceof RepoError && err.code === 'INVALID_INPUT',
    );
  });

  it('getOfflineStaff returns the merged view; a nonexistent id returns null', async () => {
    const created = await createOfflineStaff(repos, schoolId, { firstName: 'Get', lastName: 'Test' });
    const found = await getOfflineStaff(repos, schoolId, created.id);
    assert.deepEqual(found, created);
    assert.equal(await getOfflineStaff(repos, schoolId, 999999), null);
  });

  it('getOfflineStaff is school-scoped — a real tenant-isolation check', async () => {
    const created = await createOfflineStaff(repos, otherSchoolId, { firstName: 'Other', lastName: 'School' });
    assert.equal(await getOfflineStaff(repos, schoolId, created.id), null);
    assert.ok(await getOfflineStaff(repos, otherSchoolId, created.id));
  });

  it('listOfflineStaff returns joined views for the school only, excluding other schools and soft-deleted by default', async () => {
    const s1 = await createOfflineStaff(repos, schoolId, { firstName: 'List', lastName: 'One' });
    const s2 = await createOfflineStaff(repos, schoolId, { firstName: 'List', lastName: 'Two' });
    await deleteOfflineStaff(repos, schoolId, s2.id, null);

    const list = await listOfflineStaff(repos, schoolId);
    assert.ok(list.some((v) => v.id === s1.id));
    assert.ok(!list.some((v) => v.id === s2.id), 'soft-deleted staff must not appear by default');

    const withDeleted = await listOfflineStaff(repos, schoolId, { includeDeleted: true });
    assert.ok(withDeleted.some((v) => v.id === s2.id));
  });

  it('search matches first name, last name, staff number, and position, case-insensitively', async () => {
    await createOfflineStaff(repos, schoolId, { firstName: 'Zawadi', lastName: 'Okello', staffNo: 'SEARCH-42', position: 'Bursar' });

    const byFirst = await listOfflineStaff(repos, schoolId, { search: 'zawadi' });
    assert.ok(byFirst.some((v) => v.lastName === 'Okello'));

    const byStaffNo = await listOfflineStaff(repos, schoolId, { search: 'search-42' });
    assert.ok(byStaffNo.some((v) => v.firstName === 'Zawadi'));

    const byPosition = await listOfflineStaff(repos, schoolId, { search: 'bursar' });
    assert.ok(byPosition.some((v) => v.firstName === 'Zawadi'));

    const noMatch = await listOfflineStaff(repos, schoolId, { search: 'definitely-not-a-real-name' });
    assert.ok(!noMatch.some((v) => v.firstName === 'Zawadi'));
  });

  it('updateOfflineStaff updates BOTH the person and staff halves in one call, and applies explicit nulls', async () => {
    const created = await createOfflineStaff(repos, schoolId, { firstName: 'Up', lastName: 'Date', phone: '123', position: 'Original' });
    const updated = await updateOfflineStaff(repos, schoolId, created.id, {
      firstName: 'Updated', phone: null, position: null, status: 'inactive',
    });
    assert.equal(updated.firstName, 'Updated');
    assert.equal(updated.phone, null, 'explicit null on a person field must be applied, not ignored');
    assert.equal(updated.position, null, 'explicit null on a staff field must be applied, not ignored');
    assert.equal(updated.status, 'inactive');
    assert.equal(updated.lastName, 'Date', 'a field not included in the patch must be left alone');
  });

  it('updateOfflineStaff with an empty patch still returns the current view, not an error', async () => {
    const created = await createOfflineStaff(repos, schoolId, { firstName: 'No', lastName: 'Change' });
    const result = await updateOfflineStaff(repos, schoolId, created.id, {});
    assert.deepEqual(result, created);
  });

  it('updateOfflineStaff on a nonexistent id throws NOT_FOUND', async () => {
    await assert.rejects(
      () => updateOfflineStaff(repos, schoolId, 999999, { firstName: 'X' }),
      (err) => err instanceof RepoError && err.code === 'NOT_FOUND',
    );
  });

  it('delete then restore round-trips correctly, including the audit trail', async () => {
    const created = await createOfflineStaff(repos, schoolId, { firstName: 'Del', lastName: 'Restore' });
    await deleteOfflineStaff(repos, schoolId, created.id, 42, 'resigned');

    const afterDelete = await repos.staff.findById(schoolId, created.id);
    assert.notEqual(afterDelete.deletedAt, null);
    assert.equal(afterDelete.deletedBy, 42);
    assert.equal(afterDelete.deleteReason, 'resigned');

    const stillFetchable = await getOfflineStaff(repos, schoolId, created.id);
    assert.ok(stillFetchable, 'findById-based getOfflineStaff must still resolve a soft-deleted row directly by id');

    const listAfterDelete = await listOfflineStaff(repos, schoolId);
    assert.ok(!listAfterDelete.some((v) => v.id === created.id));

    const restored = await restoreOfflineStaff(repos, schoolId, created.id, 7);
    assert.equal(restored.deletedAt, null);
    assert.equal(restored.firstName, 'Del');
    const list = await listOfflineStaff(repos, schoolId);
    assert.ok(list.some((v) => v.id === created.id));
  });
});
