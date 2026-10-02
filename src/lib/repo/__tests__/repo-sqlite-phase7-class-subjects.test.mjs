// Phase 7, sub-effort 16: class_subjects. Read-only repo (no create() on
// the contract), so fixtures are inserted directly, same pattern as the
// enrollments test file for the same reason.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';

function insertAllocation(db, { classId, subjectId, teacherId = null, allocationRole = 'primary_teacher', status = 'active', supersededBy = null }) {
  const res = db.prepare(
    `INSERT INTO class_subjects (class_id, subject_id, teacher_id, allocation_role, status, superseded_by)
     VALUES (@classId, @subjectId, @teacherId, @allocationRole, @status, @supersededBy)`,
  ).run({ classId, subjectId, teacherId, allocationRole, status, supersededBy });
  return Number(res.lastInsertRowid);
}

describe('repo-sqlite: Phase 7 sub-effort 16 (class_subjects)', () => {
  let db, repos, schoolId, otherSchoolId, classA, classOther;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    schoolId = (await repos.schools.create({ name: 'Class Subject Test School' })).id;
    otherSchoolId = (await repos.schools.create({ name: 'A Different School' })).id;
    classA = (await repos.classes.create({ schoolId, name: 'Senior 1' })).id;
    classOther = (await repos.classes.create({ schoolId: otherSchoolId, name: 'Other School Class' })).id;
  });

  after(() => closeSqliteDb(db));

  it('listActiveByClassId returns the active, non-superseded allocation for a class', async () => {
    insertAllocation(db, { classId: classA, subjectId: 1, teacherId: 10, status: 'active' });
    insertAllocation(db, { classId: classA, subjectId: 2, teacherId: 11, status: 'inactive' });
    const old = insertAllocation(db, { classId: classA, subjectId: 1, teacherId: 99, status: 'active' });
    // Mark the old allocation superseded by a newer one.
    const newer = insertAllocation(db, { classId: classA, subjectId: 1, teacherId: 12, status: 'active' });
    db.prepare(`UPDATE class_subjects SET superseded_by = ? WHERE id = ?`).run(newer, old);

    const active = await repos.classSubjects.listActiveByClassId(schoolId, classA);
    assert.ok(!active.some((a) => a.id === old), 'a superseded allocation must not appear as active');
    assert.ok(active.some((a) => a.id === newer));
    assert.ok(!active.some((a) => a.status === 'inactive'));
  });

  it('listActiveByClassId is tenant-scoped through the class join, not a bare class_id match', async () => {
    insertAllocation(db, { classId: classOther, subjectId: 1, status: 'active' });
    const fromWrongSchool = await repos.classSubjects.listActiveByClassId(schoolId, classOther);
    assert.equal(fromWrongSchool.length, 0);
    const fromRightSchool = await repos.classSubjects.listActiveByClassId(otherSchoolId, classOther);
    assert.equal(fromRightSchool.length, 1);
  });

  it('listBySchool returns every allocation for the school regardless of status', async () => {
    const freshClass = (await repos.classes.create({ schoolId, name: 'Fresh Class' })).id;
    insertAllocation(db, { classId: freshClass, subjectId: 5, status: 'active' });
    insertAllocation(db, { classId: freshClass, subjectId: 6, status: 'inactive' });

    const all = await repos.classSubjects.listBySchool(schoolId);
    assert.ok(all.filter((a) => a.classId === freshClass).length === 2);
  });

  it('allocationRole and displayOnReport round-trip correctly', async () => {
    const id = insertAllocation(db, { classId: classA, subjectId: 7, allocationRole: 'co_teacher' });
    db.prepare(`UPDATE class_subjects SET display_on_report = 0 WHERE id = ?`).run(id);
    const found = (await repos.classSubjects.listActiveByClassId(schoolId, classA)).find((a) => a.id === id);
    assert.equal(found.allocationRole, 'co_teacher');
    assert.equal(found.displayOnReport, false);
  });
});
