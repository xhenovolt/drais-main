// Phase 7, sub-effort 19: attendance_rules. Read-only repo (no create()
// on the contract — rules are admin configuration), so fixtures are
// inserted directly, same pattern as every other read-only repo's test.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';

function insertRule(db, { schoolId, appliesTo = 'students', boardingScope = 'all', isActive = 1, priority = 100, lateThresholdMinutes = 15 }) {
  const res = db.prepare(
    `INSERT INTO attendance_rules (school_id, applies_to, boarding_scope, is_active, priority, late_threshold_minutes, weekday_mask)
     VALUES (@schoolId, @appliesTo, @boardingScope, @isActive, @priority, @lateThresholdMinutes, 31)`,
  ).run({ schoolId, appliesTo, boardingScope, isActive, priority, lateThresholdMinutes });
  return Number(res.lastInsertRowid);
}

describe('repo-sqlite: Phase 7 sub-effort 19 (attendance_rules)', () => {
  let db, repos, schoolId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    schoolId = (await repos.schools.create({ name: 'Attendance Rule School' })).id;
  });

  after(() => closeSqliteDb(db));

  it('findActiveForRole returns null when no rule is configured', async () => {
    assert.equal(await repos.attendanceRules.findActiveForRole(schoolId, 'student'), null);
  });

  it('finds a students-scoped rule for a student, ignoring an inactive one', async () => {
    insertRule(db, { schoolId, appliesTo: 'students', isActive: 0 });
    const active = insertRule(db, { schoolId, appliesTo: 'students', isActive: 1, lateThresholdMinutes: 20 });
    const found = await repos.attendanceRules.findActiveForRole(schoolId, 'student');
    assert.equal(found.id, active);
    assert.equal(found.lateThresholdMinutes, 20);
  });

  it('a teachers-only rule is not eligible for a student lookup, and vice versa', async () => {
    const freshSchool = (await repos.schools.create({ name: 'Role Scope School' })).id;
    insertRule(db, { schoolId: freshSchool, appliesTo: 'teachers' });
    assert.equal(await repos.attendanceRules.findActiveForRole(freshSchool, 'student'), null);
    const found = await repos.attendanceRules.findActiveForRole(freshSchool, 'staff');
    assert.ok(found);
  });

  it('is tenant-scoped — a rule belonging to another school must not leak into a third school\'s lookup', async () => {
    const schoolWithRule = (await repos.schools.create({ name: 'Has A Rule' })).id;
    const schoolWithoutRule = (await repos.schools.create({ name: 'Has No Rule' })).id;
    insertRule(db, { schoolId: schoolWithRule, appliesTo: 'students' });
    assert.ok(await repos.attendanceRules.findActiveForRole(schoolWithRule, 'student'));
    assert.equal(await repos.attendanceRules.findActiveForRole(schoolWithoutRule, 'student'), null);
  });

  it('prefers higher priority (lower number) among multiple eligible rules', async () => {
    const freshSchool = (await repos.schools.create({ name: 'Priority School' })).id;
    insertRule(db, { schoolId: freshSchool, appliesTo: 'students', priority: 200, lateThresholdMinutes: 99 });
    const preferred = insertRule(db, { schoolId: freshSchool, appliesTo: 'students', priority: 10, lateThresholdMinutes: 5 });
    const found = await repos.attendanceRules.findActiveForRole(freshSchool, 'student');
    assert.equal(found.id, preferred);
    assert.equal(found.lateThresholdMinutes, 5);
  });
});
