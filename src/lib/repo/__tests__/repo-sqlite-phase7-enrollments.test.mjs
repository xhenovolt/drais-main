// Phase 7, sub-effort 15: enrollments. Read-only repo (see
// contract/types.ts's EnrollmentRecord header for why) — no create() on
// the contract, so fixtures are inserted directly against the real
// SQLite connection, same as the rollback test in
// offline-students-route-bridge.test.mjs already does for a similar reason.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';

function insertEnrollment(db, { studentId, classId = null, streamId = null, academicYearId = null, termId = null, status = 'active', enrollmentType = 'standard', enrollmentDate = null, deletedAt = null }) {
  const res = db.prepare(
    `INSERT INTO enrollments (student_id, class_id, stream_id, academic_year_id, term_id, status, enrollment_type, enrollment_date, deleted_at)
     VALUES (@studentId, @classId, @streamId, @academicYearId, @termId, @status, @enrollmentType, @enrollmentDate, @deletedAt)`,
  ).run({ studentId, classId, streamId, academicYearId, termId, status, enrollmentType, enrollmentDate, deletedAt });
  return Number(res.lastInsertRowid);
}

describe('repo-sqlite: Phase 7 sub-effort 15 (enrollments)', () => {
  let db, repos, schoolId, otherSchoolId, studentId, otherSchoolStudentId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'Enrollment Test School' });
    schoolId = school.id;
    const otherSchool = await repos.schools.create({ name: 'A Different School' });
    otherSchoolId = otherSchool.id;

    const person = await repos.people.create({ schoolId, firstName: 'Amina', lastName: 'Student' });
    const student = await repos.students.create({ schoolId, personId: person.id, admissionNo: 'ENR-001' });
    studentId = student.id;

    const otherPerson = await repos.people.create({ schoolId: otherSchoolId, firstName: 'Other', lastName: 'Student' });
    const otherStudent = await repos.students.create({ schoolId: otherSchoolId, personId: otherPerson.id, admissionNo: 'ENR-OTH-001' });
    otherSchoolStudentId = otherStudent.id;
  });

  after(() => closeSqliteDb(db));

  it('findActiveByStudentId returns null when the student has no enrollment at all', async () => {
    assert.equal(await repos.enrollments.findActiveByStudentId(schoolId, studentId), null);
  });

  it('findActiveByStudentId returns the active enrollment, ignoring an ended one', async () => {
    insertEnrollment(db, { studentId, classId: 101, status: 'ended' });
    const activeId = insertEnrollment(db, { studentId, classId: 102, status: 'active' });

    const found = await repos.enrollments.findActiveByStudentId(schoolId, studentId);
    assert.equal(found.id, activeId);
    assert.equal(found.classId, 102);
    assert.equal(found.status, 'active');
  });

  it('with multiple simultaneous active enrollments (the real, confirmed-live multi-program case), the most recently created one wins — a documented simplification, not a claim of parity with the online programs.is_default tie-break', async () => {
    const student2 = await repos.students.create({
      schoolId, personId: (await repos.people.create({ schoolId, firstName: 'Multi', lastName: 'Program' })).id,
      admissionNo: 'ENR-MULTI-001',
    });
    insertEnrollment(db, { studentId: student2.id, classId: 201, status: 'active' });
    const latest = insertEnrollment(db, { studentId: student2.id, classId: 202, status: 'active' });

    const found = await repos.enrollments.findActiveByStudentId(schoolId, student2.id);
    assert.equal(found.id, latest);
    assert.equal(found.classId, 202);
  });

  it('findActiveByStudentId is tenant-scoped through the student, not a direct enrollments.school_id check', async () => {
    insertEnrollment(db, { studentId: otherSchoolStudentId, classId: 301, status: 'active' });
    assert.equal(await repos.enrollments.findActiveByStudentId(schoolId, otherSchoolStudentId), null);
    const found = await repos.enrollments.findActiveByStudentId(otherSchoolId, otherSchoolStudentId);
    assert.equal(found.classId, 301);
  });

  it('a soft-deleted enrollment (deleted_at set) is never "active", even if status says active', async () => {
    const student3 = await repos.students.create({
      schoolId, personId: (await repos.people.create({ schoolId, firstName: 'Deleted', lastName: 'Enrollment' })).id,
      admissionNo: 'ENR-DEL-001',
    });
    insertEnrollment(db, { studentId: student3.id, classId: 401, status: 'active', deletedAt: new Date().toISOString() });
    assert.equal(await repos.enrollments.findActiveByStudentId(schoolId, student3.id), null);
  });

  it('listByStudentId returns full history oldest-first, excluding soft-deleted by default', async () => {
    const student4 = await repos.students.create({
      schoolId, personId: (await repos.people.create({ schoolId, firstName: 'History', lastName: 'Student' })).id,
      admissionNo: 'ENR-HIST-001',
    });
    const first = insertEnrollment(db, { studentId: student4.id, classId: 501, status: 'ended' });
    const second = insertEnrollment(db, { studentId: student4.id, classId: 502, status: 'active' });
    const deleted = insertEnrollment(db, { studentId: student4.id, classId: 503, status: 'ended', deletedAt: new Date().toISOString() });

    const history = await repos.enrollments.listByStudentId(schoolId, student4.id);
    assert.deepEqual(history.map((e) => e.id), [first, second]);

    const withDeleted = await repos.enrollments.listByStudentId(schoolId, student4.id, { includeDeleted: true });
    assert.deepEqual(withDeleted.map((e) => e.id), [first, second, deleted]);
  });

  it('listActiveByClassId returns everyone currently active in a class, tenant-scoped', async () => {
    const studentA = await repos.students.create({
      schoolId, personId: (await repos.people.create({ schoolId, firstName: 'Class', lastName: 'A' })).id,
      admissionNo: 'ENR-CLS-A',
    });
    const studentB = await repos.students.create({
      schoolId, personId: (await repos.people.create({ schoolId, firstName: 'Class', lastName: 'B' })).id,
      admissionNo: 'ENR-CLS-B',
    });
    insertEnrollment(db, { studentId: studentA.id, classId: 601, status: 'active' });
    insertEnrollment(db, { studentId: studentB.id, classId: 601, status: 'active' });
    insertEnrollment(db, { studentId: studentB.id, classId: 602, status: 'ended' });
    insertEnrollment(db, { studentId: otherSchoolStudentId, classId: 601, status: 'active' }); // different school, same class id — must not leak in

    const roster = await repos.enrollments.listActiveByClassId(schoolId, 601);
    assert.equal(roster.length, 2);
    assert.ok(roster.every((e) => e.classId === 601 && e.status === 'active'));
  });

  it('listBySchool returns every enrollment for the school (active + ended), tenant-scoped, excluding soft-deleted by default', async () => {
    const freshSchool = (await repos.schools.create({ name: 'Fresh Enrollment School' })).id;
    const s1 = await repos.students.create({
      schoolId: freshSchool, personId: (await repos.people.create({ schoolId: freshSchool, firstName: 'Bulk', lastName: 'One' })).id,
      admissionNo: 'ENR-BULK-1',
    });
    const s2 = await repos.students.create({
      schoolId: freshSchool, personId: (await repos.people.create({ schoolId: freshSchool, firstName: 'Bulk', lastName: 'Two' })).id,
      admissionNo: 'ENR-BULK-2',
    });
    const active = insertEnrollment(db, { studentId: s1.id, classId: 701, status: 'active' });
    const ended = insertEnrollment(db, { studentId: s2.id, classId: 701, status: 'ended' });
    const deleted = insertEnrollment(db, { studentId: s1.id, classId: 702, status: 'ended', deletedAt: new Date().toISOString() });

    const all = await repos.enrollments.listBySchool(freshSchool);
    assert.deepEqual(all.map((e) => e.id).sort(), [active, ended].sort());

    const withDeleted = await repos.enrollments.listBySchool(freshSchool, { includeDeleted: true });
    assert.deepEqual(withDeleted.map((e) => e.id).sort(), [active, ended, deleted].sort());
  });
});
