// Phase 7, sub-effort 11: the first offline-students slice. Real
// in-memory SQLite, no mocking — same discipline as every prior sub-effort.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import {
  listOfflineStudents, getOfflineStudent, createOfflineStudent,
  updateOfflineStudent, deleteOfflineStudent, restoreOfflineStudent,
} from '@/lib/repo/offline-students';
import { RepoError } from '@/lib/repo/contract/types';

describe('offline-students', () => {
  let db, repos, schoolId, otherSchoolId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'Offline Students School' });
    schoolId = school.id;
    const other = await repos.schools.create({ name: 'A Different School' });
    otherSchoolId = other.id;
  });

  after(() => closeSqliteDb(db));

  it('create produces a real person AND student, joined correctly', async () => {
    const view = await createOfflineStudent(repos, schoolId, {
      firstName: 'Amina', lastName: 'Nakato', admissionNo: 'STU-001', gender: 'female',
    });
    assert.equal(view.firstName, 'Amina');
    assert.equal(view.admissionNo, 'STU-001');
    assert.ok(view.id);
    assert.ok(view.personId);

    // Confirm both underlying rows genuinely exist, not just the merged view.
    const student = await repos.students.findById(schoolId, view.id);
    const person = await repos.people.findById(view.personId);
    assert.ok(student);
    assert.ok(person);
    assert.equal(person.firstName, 'Amina');
  });

  it('missing firstName/lastName is a clear INVALID_INPUT error, not a confusing downstream failure', async () => {
    await assert.rejects(
      () => createOfflineStudent(repos, schoolId, { firstName: '', lastName: 'X' }),
      (err) => err instanceof RepoError && err.code === 'INVALID_INPUT',
    );
  });

  it('getOfflineStudent returns the merged view; a nonexistent id returns null', async () => {
    const created = await createOfflineStudent(repos, schoolId, { firstName: 'Get', lastName: 'Test' });
    const found = await getOfflineStudent(repos, schoolId, created.id);
    assert.deepEqual(found, created);
    assert.equal(await getOfflineStudent(repos, schoolId, 999999), null);
  });

  it('getOfflineStudent is school-scoped — a real tenant-isolation check, not a formality', async () => {
    const created = await createOfflineStudent(repos, otherSchoolId, { firstName: 'Other', lastName: 'School' });
    assert.equal(await getOfflineStudent(repos, schoolId, created.id), null);
    assert.ok(await getOfflineStudent(repos, otherSchoolId, created.id));
  });

  it('listOfflineStudents returns joined views for the school only, excluding other schools and soft-deleted by default', async () => {
    const s1 = await createOfflineStudent(repos, schoolId, { firstName: 'List', lastName: 'One' });
    const s2 = await createOfflineStudent(repos, schoolId, { firstName: 'List', lastName: 'Two' });
    await deleteOfflineStudent(repos, schoolId, s2.id, null);

    const list = await listOfflineStudents(repos, schoolId);
    assert.ok(list.some((v) => v.id === s1.id));
    assert.ok(!list.some((v) => v.id === s2.id), 'soft-deleted students must not appear by default');

    const withDeleted = await listOfflineStudents(repos, schoolId, { includeDeleted: true });
    assert.ok(withDeleted.some((v) => v.id === s2.id));
  });

  it('search matches first name, last name, and admission number, case-insensitively', async () => {
    await createOfflineStudent(repos, schoolId, { firstName: 'Zawadi', lastName: 'Otieno', admissionNo: 'SEARCH-42' });

    const byFirst = await listOfflineStudents(repos, schoolId, { search: 'zawadi' });
    assert.ok(byFirst.some((v) => v.lastName === 'Otieno'));

    const byAdmission = await listOfflineStudents(repos, schoolId, { search: 'search-42' });
    assert.ok(byAdmission.some((v) => v.firstName === 'Zawadi'));

    const noMatch = await listOfflineStudents(repos, schoolId, { search: 'definitely-not-a-real-name' });
    assert.ok(!noMatch.some((v) => v.firstName === 'Zawadi'));
  });

  it('updateOfflineStudent updates BOTH the person and student halves in one call, and applies explicit nulls', async () => {
    const created = await createOfflineStudent(repos, schoolId, { firstName: 'Up', lastName: 'Date', phone: '123', notes: 'original' });
    const updated = await updateOfflineStudent(repos, schoolId, created.id, {
      firstName: 'Updated', phone: null, notes: null, status: 'inactive',
    });
    assert.equal(updated.firstName, 'Updated');
    assert.equal(updated.phone, null, 'explicit null on a person field must be applied, not ignored');
    assert.equal(updated.notes, null, 'explicit null on a student field must be applied, not ignored');
    assert.equal(updated.status, 'inactive');
    assert.equal(updated.lastName, 'Date', 'a field not included in the patch must be left alone');
  });

  it('updateOfflineStudent with an empty patch still returns the current view, not an error', async () => {
    const created = await createOfflineStudent(repos, schoolId, { firstName: 'No', lastName: 'Change' });
    const result = await updateOfflineStudent(repos, schoolId, created.id, {});
    assert.deepEqual(result, created);
  });

  it('updateOfflineStudent on a nonexistent id throws NOT_FOUND', async () => {
    await assert.rejects(
      () => updateOfflineStudent(repos, schoolId, 999999, { firstName: 'X' }),
      (err) => err instanceof RepoError && err.code === 'NOT_FOUND',
    );
  });

  it('delete then restore round-trips correctly, including the audit trail', async () => {
    const created = await createOfflineStudent(repos, schoolId, { firstName: 'Del', lastName: 'Restore' });
    await deleteOfflineStudent(repos, schoolId, created.id, 42, 'left the school');

    const afterDelete = await repos.students.findById(schoolId, created.id);
    assert.notEqual(afterDelete.deletedAt, null);
    assert.equal(afterDelete.deletedBy, 42);
    assert.equal(afterDelete.deleteReason, 'left the school');
    // getOfflineStudent is findById-based, which (matching this repo
    // layer's established pattern elsewhere) does NOT filter deleted_at —
    // only listBySchool hides soft-deleted rows by default. So a
    // soft-deleted student is still directly fetchable by id...
    const stillFetchable = await getOfflineStudent(repos, schoolId, created.id);
    assert.ok(stillFetchable, 'findById-based getOfflineStudent must still resolve a soft-deleted row directly by id');
    assert.notEqual(stillFetchable.deletedAt, null);
    // ...but must not appear in the default list.
    const listAfterDelete = await listOfflineStudents(repos, schoolId);
    assert.ok(!listAfterDelete.some((v) => v.id === created.id));

    const restored = await restoreOfflineStudent(repos, schoolId, created.id, 7);
    assert.equal(restored.deletedAt, null);
    assert.equal(restored.firstName, 'Del');
    const list = await listOfflineStudents(repos, schoolId);
    assert.ok(list.some((v) => v.id === created.id));
  });
});
