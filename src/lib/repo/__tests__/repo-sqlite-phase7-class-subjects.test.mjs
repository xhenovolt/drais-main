// Phase 7, sub-effort 16 (read) + sub-effort 19 (write, "full CRUD" per
// explicit user instruction). Read-path fixtures are still inserted
// directly where that's simpler than going through create().
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

  describe('writes (sub-effort 19): create / update / end', () => {
    it('create() allocates a new active row', async () => {
      const created = await repos.classSubjects.create(schoolId, { classId: classA, subjectId: 10, teacherId: 55 });
      assert.equal(created.status, 'active');
      assert.equal(created.teacherId, 55);
      assert.equal(created.allocationRole, 'primary_teacher');
    });

    it('create() refuses a class that does not belong to this school', async () => {
      await assert.rejects(
        () => repos.classSubjects.create(otherSchoolId, { classId: classA, subjectId: 10 }),
        (err) => err.code === 'NOT_FOUND',
      );
    });

    it('create() allows co-teaching — a second allocation for the same class+subject is not forbidden', async () => {
      const first = await repos.classSubjects.create(schoolId, { classId: classA, subjectId: 11, teacherId: 1, allocationRole: 'primary_teacher' });
      const second = await repos.classSubjects.create(schoolId, { classId: classA, subjectId: 11, teacherId: 2, allocationRole: 'co_teacher' });
      assert.notEqual(first.id, second.id);
      const active = await repos.classSubjects.listActiveByClassId(schoolId, classA);
      assert.ok(active.some((a) => a.id === first.id) && active.some((a) => a.id === second.id));
    });

    it('update() corrects the teacher/role in place without ending the allocation', async () => {
      const created = await repos.classSubjects.create(schoolId, { classId: classA, subjectId: 12, teacherId: 1 });
      const updated = await repos.classSubjects.update(schoolId, created.id, { teacherId: 2, allocationRole: 'co_teacher' });
      assert.equal(updated.teacherId, 2);
      assert.equal(updated.allocationRole, 'co_teacher');
      assert.equal(updated.status, 'active');
    });

    it('update() on a nonexistent id throws NOT_FOUND', async () => {
      await assert.rejects(() => repos.classSubjects.update(schoolId, 999999, { teacherId: 1 }), (err) => err.code === 'NOT_FOUND');
    });

    it('end() marks the allocation inactive, and it stops appearing as active', async () => {
      const created = await repos.classSubjects.create(schoolId, { classId: classA, subjectId: 13 });
      const ended = await repos.classSubjects.end(schoolId, created.id);
      assert.equal(ended.status, 'inactive');
      const active = await repos.classSubjects.listActiveByClassId(schoolId, classA);
      assert.ok(!active.some((a) => a.id === created.id));
    });

    it('end() on a nonexistent id throws NOT_FOUND', async () => {
      await assert.rejects(() => repos.classSubjects.end(schoolId, 999999), (err) => err.code === 'NOT_FOUND');
    });
  });
});
