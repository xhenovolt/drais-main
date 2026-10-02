// Phase 7, sub-effort 17: the offline-academics slice. Real in-memory
// SQLite, no mocking — same discipline as every prior sub-effort.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import {
  listOfflineClasses, getOfflineClassDetail,
  createOfflineClass, updateOfflineClass, deleteOfflineClass,
  listOfflineSubjects, createOfflineSubject, updateOfflineSubject, deleteOfflineSubject,
  assignTeacherToSubject, endTeacherAllocation,
  upsertOfflineResult, deleteOfflineResult, listOfflineResultsForClassSubject,
} from '@/lib/repo/offline-academics';
import { RepoError } from '@/lib/repo/contract/types';

describe('offline-academics', () => {
  let db, repos, schoolId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    schoolId = (await repos.schools.create({ name: 'Offline Academics School' })).id;
  });

  after(() => closeSqliteDb(db));

  it('listOfflineClasses returns the school\'s classes', async () => {
    await repos.classes.create({ schoolId, name: 'Senior 1' });
    await repos.classes.create({ schoolId, name: 'Senior 2' });
    const list = await listOfflineClasses(repos, schoolId);
    assert.ok(list.some((c) => c.name === 'Senior 1'));
    assert.ok(list.some((c) => c.name === 'Senior 2'));
  });

  it('getOfflineClassDetail returns null for an unknown class', async () => {
    assert.equal(await getOfflineClassDetail(repos, schoolId, 999999), null);
  });

  it('getOfflineClassDetail resolves subjects + teacher names via composition', async () => {
    const cls = await repos.classes.create({ schoolId, name: 'Detail Class' });
    const subject = await repos.subjects.create({ schoolId, name: 'Mathematics' });
    const teacherPerson = await repos.people.create({ schoolId, firstName: 'Grace', lastName: 'Teacher' });
    const teacher = await repos.staff.create({ schoolId, personId: teacherPerson.id, staffNo: 'STF-DET-1' });
    db.prepare(
      `INSERT INTO class_subjects (class_id, subject_id, teacher_id, allocation_role, status) VALUES (?, ?, ?, 'primary_teacher', 'active')`,
    ).run(cls.id, subject.id, teacher.id);

    const detail = await getOfflineClassDetail(repos, schoolId, cls.id);
    assert.equal(detail.subjects.length, 1);
    assert.equal(detail.subjects[0].subjectName, 'Mathematics');
    assert.equal(detail.subjects[0].teacherName, 'Grace Teacher');
  });

  it('getOfflineClassDetail resolves a dangling subject/teacher reference to null, not a crash', async () => {
    const cls = await repos.classes.create({ schoolId, name: 'Dangling Refs Class' });
    db.prepare(
      `INSERT INTO class_subjects (class_id, subject_id, teacher_id, status) VALUES (?, 999999, 999999, 'active')`,
    ).run(cls.id);

    const detail = await getOfflineClassDetail(repos, schoolId, cls.id);
    assert.equal(detail.subjects[0].subjectName, null);
    assert.equal(detail.subjects[0].teacherName, null);
  });

  it('getOfflineClassDetail resolves the current roster via EnrollmentRepo', async () => {
    const cls = await repos.classes.create({ schoolId, name: 'Roster Class' });
    const studentPerson = await repos.people.create({ schoolId, firstName: 'Amina', lastName: 'Student' });
    const student = await repos.students.create({ schoolId, personId: studentPerson.id, admissionNo: 'ROSTER-001' });
    db.prepare(`INSERT INTO enrollments (student_id, class_id, status) VALUES (?, ?, 'active')`).run(student.id, cls.id);

    const detail = await getOfflineClassDetail(repos, schoolId, cls.id);
    assert.equal(detail.roster.length, 1);
    assert.equal(detail.roster[0].name, 'Amina Student');
    assert.equal(detail.roster[0].admissionNo, 'ROSTER-001');
  });

  it('getOfflineClassDetail is tenant-scoped', async () => {
    const otherSchoolId = (await repos.schools.create({ name: 'A Different School' })).id;
    const otherClass = await repos.classes.create({ schoolId: otherSchoolId, name: 'Other School Class' });
    assert.equal(await getOfflineClassDetail(repos, schoolId, otherClass.id), null);
  });

  describe('writes (sub-effort 19): classes / subjects / allocations / marks', () => {
    it('createOfflineClass requires a name', async () => {
      await assert.rejects(() => createOfflineClass(repos, schoolId, {}), (err) => err instanceof RepoError && err.code === 'INVALID_INPUT');
    });

    it('classes: create, update, delete round-trip', async () => {
      const created = await createOfflineClass(repos, schoolId, { name: 'Write Test Class' });
      assert.equal(created.name, 'Write Test Class');
      const updated = await updateOfflineClass(repos, schoolId, created.id, { code: 'WTC' });
      assert.equal(updated.code, 'WTC');
      await deleteOfflineClass(repos, schoolId, created.id, 42);
      const list = await listOfflineClasses(repos, schoolId);
      assert.ok(!list.some((c) => c.id === created.id), 'a soft-deleted class must not appear in the default list');
    });

    it('subjects: create, update, delete round-trip', async () => {
      const created = await createOfflineSubject(repos, schoolId, { name: 'Write Test Subject' });
      assert.equal(created.name, 'Write Test Subject');
      const updated = await updateOfflineSubject(repos, schoolId, created.id, { code: 'WTS' });
      assert.equal(updated.code, 'WTS');
      await deleteOfflineSubject(repos, schoolId, created.id, 42);
      const list = await listOfflineSubjects(repos, schoolId);
      assert.ok(!list.some((s) => s.id === created.id));
    });

    it('assignTeacherToSubject resolves the subject/teacher names through composition, same as the read path', async () => {
      const cls = await createOfflineClass(repos, schoolId, { name: 'Allocation Class' });
      const subject = await createOfflineSubject(repos, schoolId, { name: 'Allocation Subject' });
      const teacherPerson = await repos.people.create({ schoolId, firstName: 'Grace', lastName: 'Teacher' });
      const teacher = await repos.staff.create({ schoolId, personId: teacherPerson.id, staffNo: 'ALLOC-STF-1' });

      const allocation = await assignTeacherToSubject(repos, schoolId, { classId: cls.id, subjectId: subject.id, teacherId: teacher.id });
      assert.equal(allocation.subjectName, 'Allocation Subject');
      assert.equal(allocation.teacherName, 'Grace Teacher');

      const detail = await getOfflineClassDetail(repos, schoolId, cls.id);
      assert.ok(detail.subjects.some((s) => s.id === allocation.id));

      await endTeacherAllocation(repos, schoolId, allocation.id);
      const afterEnd = await getOfflineClassDetail(repos, schoolId, cls.id);
      assert.ok(!afterEnd.subjects.some((s) => s.id === allocation.id), 'an ended allocation must not appear as active');
    });

    it('assignTeacherToSubject requires classId and subjectId', async () => {
      await assert.rejects(() => assignTeacherToSubject(repos, schoolId, {}), (err) => err instanceof RepoError && err.code === 'INVALID_INPUT');
    });

    it('marks: upsertOfflineResult creates then updates in place for the same (student, class, subject, term, resultType)', async () => {
      const cls = await createOfflineClass(repos, schoolId, { name: 'Marks Class' });
      const subject = await createOfflineSubject(repos, schoolId, { name: 'Marks Subject' });
      const studentPerson = await repos.people.create({ schoolId, firstName: 'Amina', lastName: 'Marks' });
      const student = await repos.students.create({ schoolId, personId: studentPerson.id, admissionNo: 'MARKS-001' });

      const created = await upsertOfflineResult(repos, schoolId, {
        studentId: student.id, classId: cls.id, subjectId: subject.id, resultTypeId: 1, score: 75, grade: 'B',
      });
      assert.equal(created.score, 75);

      const updated = await upsertOfflineResult(repos, schoolId, {
        studentId: student.id, classId: cls.id, subjectId: subject.id, resultTypeId: 1, score: 88, grade: 'A',
      });
      assert.equal(updated.id, created.id, 'the same natural key must update in place, not create a second row');
      assert.equal(updated.score, 88);

      const list = await listOfflineResultsForClassSubject(repos, schoolId, cls.id, subject.id);
      assert.equal(list.length, 1);

      await deleteOfflineResult(repos, schoolId, updated.id, 42);
      const afterDelete = await listOfflineResultsForClassSubject(repos, schoolId, cls.id, subject.id);
      assert.equal(afterDelete.length, 0, 'a soft-deleted result must not appear in the class/subject listing');
    });
  });
});
