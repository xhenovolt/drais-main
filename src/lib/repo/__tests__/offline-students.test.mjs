// Phase 7, sub-effort 11: the first offline-students slice. Real
// in-memory SQLite, no mocking — same discipline as every prior sub-effort.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import {
  listOfflineStudents, getOfflineStudent, createOfflineStudent,
  updateOfflineStudent, deleteOfflineStudent, restoreOfflineStudent,
  assignStudentToClass, unassignStudentFromClass, admitOfflineStudent,
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

  it('currentClass is null when the student has no active enrollment', async () => {
    const created = await createOfflineStudent(repos, schoolId, { firstName: 'No', lastName: 'Class' });
    assert.equal(created.currentClass, null);
  });

  it('currentClass resolves the real class name through EnrollmentRepo + ClassRepo (sub-effort 18)', async () => {
    const created = await createOfflineStudent(repos, schoolId, { firstName: 'Has', lastName: 'Class' });
    const cls = await repos.classes.create({ schoolId, name: 'Senior 2 Arts' });
    db.prepare(
      `INSERT INTO enrollments (student_id, class_id, status) VALUES (?, ?, 'active')`,
    ).run(created.id, cls.id);

    const found = await getOfflineStudent(repos, schoolId, created.id);
    assert.deepEqual(found.currentClass, { id: cls.id, name: 'Senior 2 Arts' });

    const listed = await listOfflineStudents(repos, schoolId);
    const inList = listed.find((v) => v.id === created.id);
    assert.deepEqual(inList.currentClass, { id: cls.id, name: 'Senior 2 Arts' });
  });

  it('currentClass is null, not a crash, when the enrollment points at a class row this install does not have', async () => {
    const created = await createOfflineStudent(repos, schoolId, { firstName: 'Dangling', lastName: 'Class' });
    db.prepare(
      `INSERT INTO enrollments (student_id, class_id, status) VALUES (?, ?, 'active')`,
    ).run(created.id, 999999);

    const found = await getOfflineStudent(repos, schoolId, created.id);
    assert.equal(found.currentClass, null);
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

  describe('class placement writes (sub-effort 19): assignStudentToClass / unassignStudentFromClass', () => {
    it('assignStudentToClass places a student with no prior enrollment into a class', async () => {
      const created = await createOfflineStudent(repos, schoolId, { firstName: 'Fresh', lastName: 'Placement' });
      const cls = await repos.classes.create({ schoolId, name: 'Senior 3' });
      const result = await assignStudentToClass(repos, schoolId, created.id, cls.id);
      assert.deepEqual(result.currentClass, { id: cls.id, name: 'Senior 3' });
    });

    it('assignStudentToClass ends the PREVIOUS enrollment (a real transition in history, not an edit-in-place)', async () => {
      const created = await createOfflineStudent(repos, schoolId, { firstName: 'Moving', lastName: 'Student' });
      const classA = await repos.classes.create({ schoolId, name: 'Class A' });
      const classB = await repos.classes.create({ schoolId, name: 'Class B' });
      await assignStudentToClass(repos, schoolId, created.id, classA.id);
      const afterMove = await assignStudentToClass(repos, schoolId, created.id, classB.id, 'promoted');
      assert.deepEqual(afterMove.currentClass, { id: classB.id, name: 'Class B' });

      const history = await repos.enrollments.listByStudentId(schoolId, created.id);
      assert.equal(history.length, 2);
      const ended = history.find((e) => e.classId === classA.id);
      assert.equal(ended.status, 'ended');
      assert.equal(ended.endReason, 'promoted');
    });

    it('unassignStudentFromClass ends the current enrollment with no replacement', async () => {
      const created = await createOfflineStudent(repos, schoolId, { firstName: 'To', lastName: 'Unassign' });
      const cls = await repos.classes.create({ schoolId, name: 'Temp Class' });
      await assignStudentToClass(repos, schoolId, created.id, cls.id);
      const result = await unassignStudentFromClass(repos, schoolId, created.id, 'left the school');
      assert.equal(result.currentClass, null);

      const history = await repos.enrollments.listByStudentId(schoolId, created.id);
      assert.equal(history[0].status, 'ended');
      assert.equal(history[0].endReason, 'left the school');
    });

    it('unassignStudentFromClass on a student with no enrollment at all is a safe no-op, not an error', async () => {
      const created = await createOfflineStudent(repos, schoolId, { firstName: 'Never', lastName: 'Enrolled' });
      const result = await unassignStudentFromClass(repos, schoolId, created.id);
      assert.equal(result.currentClass, null);
    });
  });

  // Phase 7 sub-effort 28 — the offline branch of the REAL /api/students
  // POST handler (src/app/api/students/route.ts), not a new offline-only
  // route. Composes createOfflineStudent + assignStudentToClass the same
  // way the online handler composes its two raw INSERTs.
  describe('admitOfflineStudent (real /api/students route branch)', () => {
    it('admits a student with no class — mirrors the online route\'s "no class_id" path', async () => {
      const result = await admitOfflineStudent(repos, schoolId, { firstName: 'Khalid', lastName: 'Osman' });
      assert.ok(result.studentId);
      assert.ok(result.personId);
      assert.equal(result.enrollmentCreated, false);
      const view = await getOfflineStudent(repos, schoolId, result.studentId);
      assert.equal(view.currentClass, null);
    });

    it('admits a student WITH a classId — mirrors the online route\'s "if (class_id)" enrollment branch', async () => {
      const cls = await repos.classes.create({ schoolId, name: 'Admit-Test Class' });
      const result = await admitOfflineStudent(repos, schoolId, { firstName: 'Zainab', lastName: 'Ali', classId: cls.id });
      assert.equal(result.enrollmentCreated, true);
      const view = await getOfflineStudent(repos, schoolId, result.studentId);
      assert.equal(view.currentClass?.id, cls.id);
    });

    it('missing firstName/lastName still fails clearly, same as the bare create() path', async () => {
      await assert.rejects(
        () => admitOfflineStudent(repos, schoolId, { firstName: '', lastName: '' }),
        /firstName and lastName are required/,
      );
    });
  });
});
