// Phase 7, sub-effort 17: the offline-academics slice. Real in-memory
// SQLite, no mocking — same discipline as every prior sub-effort.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import { listOfflineClasses, getOfflineClassDetail } from '@/lib/repo/offline-academics';

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
});
