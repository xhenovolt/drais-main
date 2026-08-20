// Phase 7, sub-effort 3: staff. Same in-memory, real-SQLite approach as
// the other repo-sqlite test files.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';

describe('repo-sqlite: Phase 7 sub-effort 3 (staff)', () => {
  let db, repos, schoolId, otherSchoolId, personId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'Staff Test School' });
    schoolId = school.id;
    const otherSchool = await repos.schools.create({ name: 'A Different School' });
    otherSchoolId = otherSchool.id;

    const person = await repos.people.create({ schoolId, firstName: 'Grace', lastName: 'Nabirye' });
    personId = person.id;
  });

  after(() => {
    closeSqliteDb(db);
  });

  it('create/findById round-trip, no salary/bank fields on the record at all', async () => {
    const s = await repos.staff.create({
      schoolId, personId, staffNo: 'STF-001', position: 'Class Teacher',
      employmentType: 'permanent', hireDate: '2024-01-15',
    });
    assert.equal(s.staffNo, 'STF-001');
    assert.equal(s.employmentType, 'permanent');
    assert.equal(s.hireDate, '2024-01-15');
    assert.equal('salary' in s, false, 'StaffRecord must never carry salary — deliberate security scope cut');
    assert.equal('bankAccountNo' in s, false);

    const found = await repos.staff.findById(schoolId, s.id);
    assert.deepEqual(found, s);
  });

  it('has no createdAt field, and updatedAt is a real timestamp string set on create (nullable by contract, not by this path)', async () => {
    const s = await repos.staff.create({ schoolId, personId, staffNo: 'STF-002' });
    assert.equal('createdAt' in s, false, 'staff has no created_at column in the real schema — must not be invented');
    assert.equal(typeof s.updatedAt, 'string');
  });

  it('findByPersonId resolves the staff record for a person (report-card teacher-name lookup shape)', async () => {
    const person2 = await repos.people.create({ schoolId, firstName: 'Moses', lastName: 'Okello' });
    const s = await repos.staff.create({ schoolId, personId: person2.id, staffNo: 'STF-003' });
    const found = await repos.staff.findByPersonId(schoolId, person2.id);
    assert.equal(found?.id, s.id);

    const notFound = await repos.staff.findByPersonId(otherSchoolId, person2.id);
    assert.equal(notFound, null, 'a person\'s staff record must not resolve under the wrong school');
  });

  it('findById is school-scoped — a staff row in another school is not findable via the wrong schoolId', async () => {
    const otherPerson = await repos.people.create({ schoolId: otherSchoolId, firstName: 'Other', lastName: 'Staff' });
    const otherStaff = await repos.staff.create({ schoolId: otherSchoolId, personId: otherPerson.id, staffNo: 'OTH-001' });
    const found = await repos.staff.findById(schoolId, otherStaff.id);
    assert.equal(found, null);
    const foundRight = await repos.staff.findById(otherSchoolId, otherStaff.id);
    assert.equal(foundRight?.id, otherStaff.id);
  });

  it('update() applies an explicit null (same rule as every other repo in this layer)', async () => {
    const s = await repos.staff.create({ schoolId, personId, staffNo: 'STF-004', position: 'Bursar' });
    const cleared = await repos.staff.update(schoolId, s.id, { position: null });
    assert.equal(cleared.position, null);
  });

  it('softDelete records deletedBy/deleteReason; restore clears deletedAt and records restoredBy', async () => {
    const s = await repos.staff.create({ schoolId, personId, staffNo: 'STF-005' });
    await repos.staff.softDelete(schoolId, s.id, { deletedBy: 42, deleteReason: 'left the school' });
    const listed = await repos.staff.listBySchool(schoolId, { limit: 1000 });
    assert.ok(!listed.some((x) => x.id === s.id), 'soft-deleted staff must not appear in the default list');

    const restored = await repos.staff.restore(schoolId, s.id, 43);
    assert.equal(restored.deletedAt, null);
    assert.equal(restored.restoredBy, 43);
    const listedAgain = await repos.staff.listBySchool(schoolId, { limit: 1000 });
    assert.ok(listedAgain.some((x) => x.id === s.id), 'restored staff must reappear in the default list');
  });

  it('employment_type CHECK constraint rejects a value outside the real enum', async () => {
    await assert.rejects(
      () => repos.staff.create({ schoolId, personId, staffNo: 'STF-006', employmentType: 'freelance' }),
    );
  });
});
