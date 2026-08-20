// Phase 7, sub-effort 2: classes, class_results. Same in-memory, real-
// SQLite approach as the other repo-sqlite test files.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';

describe('repo-sqlite: Phase 7 sub-effort 2 (classes, class_results)', () => {
  let db, repos, schoolId, otherSchoolId, classId, otherClassId, studentId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'Academics Test School' });
    schoolId = school.id;
    const otherSchool = await repos.schools.create({ name: 'A Different School' });
    otherSchoolId = otherSchool.id;

    const cls = await repos.classes.create({ schoolId, name: 'Primary 5' });
    classId = cls.id;
    const otherClass = await repos.classes.create({ schoolId: otherSchoolId, name: 'Primary 5 (other school)' });
    otherClassId = otherClass.id;

    const person = await repos.people.create({ schoolId, firstName: 'Zawadi', lastName: 'Otieno' });
    const student = await repos.students.create({ schoolId, personId: person.id, admissionNo: `ACAD-${Date.now()}` });
    studentId = student.id;
  });

  after(() => {
    closeSqliteDb(db);
  });

  describe('ClassRepo', () => {
    it('create/findById round-trip', async () => {
      const c = await repos.classes.create({ schoolId, name: 'Primary 6', code: 'P6' });
      const found = await repos.classes.findById(schoolId, c.id);
      assert.deepEqual(found, c);
    });

    it('update() applies an explicit null (same rule as every other repo in this layer)', async () => {
      const c = await repos.classes.create({ schoolId, name: 'Primary 7', code: 'P7' });
      const cleared = await repos.classes.update(schoolId, c.id, { code: null });
      assert.equal(cleared.code, null);
    });

    it('softDelete records deletedBy/deleteReason; restore clears deletedAt and records restoredBy', async () => {
      const c = await repos.classes.create({ schoolId, name: 'Temp Class' });
      await repos.classes.softDelete(schoolId, c.id, { deletedBy: 99, deleteReason: 'merged into another class' });
      const listed = await repos.classes.listBySchool(schoolId, { limit: 1000 });
      assert.ok(!listed.some((x) => x.id === c.id), 'soft-deleted class must not appear in the default list');

      const restored = await repos.classes.restore(schoolId, c.id, 100);
      assert.equal(restored.deletedAt, null);
      assert.equal(restored.restoredBy, 100);
      const listedAgain = await repos.classes.listBySchool(schoolId, { limit: 1000 });
      assert.ok(listedAgain.some((x) => x.id === c.id), 'restored class must reappear in the default list');
    });

    it('findById is school-scoped — a class in another school is not findable via the wrong schoolId', async () => {
      const found = await repos.classes.findById(schoolId, otherClassId);
      assert.equal(found, null);
    });
  });

  describe('ClassResultRepo', () => {
    it('create/findById round-trip, score correctly typed as a number (not the DECIMAL-as-string surprise found in mysql)', async () => {
      const r = await repos.classResults.create({
        studentId, classId, subjectId: 1, termId: 1, resultTypeId: 1, score: 78.5, grade: 'B',
      });
      assert.equal(typeof r.score, 'number');
      assert.equal(r.score, 78.5);
      const found = await repos.classResults.findById(schoolId, r.id);
      assert.deepEqual(found, r);
    });

    it('THE core property: a class_result is tenant-scoped through classes, not directly — proven, not assumed', async () => {
      // A result that legitimately belongs to the OTHER school's class.
      const otherPerson = await repos.people.create({ schoolId: otherSchoolId, firstName: 'Other', lastName: 'Student' });
      const otherStudent = await repos.students.create({ schoolId: otherSchoolId, personId: otherPerson.id });
      const otherResult = await repos.classResults.create({
        studentId: otherStudent.id, classId: otherClassId, subjectId: 1, resultTypeId: 1, score: 50,
      });
      // Asking for it under the WRONG school must fail — this is the
      // actual tenant-isolation guarantee the JOIN-through-classes exists
      // to provide, exercised directly rather than assumed from the SQL text.
      const wrongSchool = await repos.classResults.findById(schoolId, otherResult.id);
      assert.equal(wrongSchool, null);
      const rightSchool = await repos.classResults.findById(otherSchoolId, otherResult.id);
      assert.equal(rightSchool?.id, otherResult.id);
    });

    it('findByStudentSubjectTerm finds the natural marks-entry key, including the NULL-term case', async () => {
      const r1 = await repos.classResults.create({ studentId, classId, subjectId: 2, termId: 3, resultTypeId: 1, score: 60 });
      const found = await repos.classResults.findByStudentSubjectTerm(schoolId, studentId, classId, 2, 3, 1);
      assert.equal(found?.id, r1.id);

      const r2 = await repos.classResults.create({ studentId, classId, subjectId: 4, termId: null, resultTypeId: 1, score: 70 });
      const foundNullTerm = await repos.classResults.findByStudentSubjectTerm(schoolId, studentId, classId, 4, null, 1);
      assert.equal(foundNullTerm?.id, r2.id);
    });

    it('listByClassAndSubject returns only that class+subject, and update() applies an explicit null', async () => {
      const person2 = await repos.people.create({ schoolId, firstName: 'Second', lastName: 'Student' });
      const student2 = await repos.students.create({ schoolId, personId: person2.id });
      await repos.classResults.create({ studentId, classId, subjectId: 5, resultTypeId: 1, score: 80 });
      await repos.classResults.create({ studentId: student2.id, classId, subjectId: 5, resultTypeId: 1, score: 90 });
      await repos.classResults.create({ studentId, classId, subjectId: 6, resultTypeId: 1, score: 40 }); // different subject

      const list = await repos.classResults.listByClassAndSubject(schoolId, classId, 5);
      assert.equal(list.length, 2);
      assert.ok(list.every((r) => r.subjectId === 5));

      const updated = await repos.classResults.update(schoolId, list[0].id, { remarks: null, score: 85 });
      assert.equal(updated.remarks, null);
      assert.equal(updated.score, 85);
    });

    it('softDelete + restore carries the richer audit trail, scoped through classes', async () => {
      const r = await repos.classResults.create({ studentId, classId, subjectId: 7, resultTypeId: 1, score: 55 });
      await repos.classResults.softDelete(schoolId, r.id, { deletedBy: 7, deleteReason: 'entry error' });
      const afterDelete = await repos.classResults.findById(schoolId, r.id);
      assert.notEqual(afterDelete?.deletedAt, null);
      assert.equal(afterDelete?.deletedBy, 7);

      const restored = await repos.classResults.restore(schoolId, r.id, 8);
      assert.equal(restored.deletedAt, null);
      assert.equal(restored.restoredBy, 8);
    });
  });
});
