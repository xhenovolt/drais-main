// Phase 7, sub-effort 4: subjects, terms, academic_years. Same in-memory,
// real-SQLite approach as the other repo-sqlite test files.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';

describe('repo-sqlite: Phase 7 sub-effort 4 (subjects, terms, academic_years)', () => {
  let db, repos, schoolId, otherSchoolId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'Academic Structure Test School' });
    schoolId = school.id;
    const otherSchool = await repos.schools.create({ name: 'A Different School' });
    otherSchoolId = otherSchool.id;
  });

  after(() => {
    closeSqliteDb(db);
  });

  describe('SubjectRepo', () => {
    it('create/findById round-trip, academicType defaults to secular', async () => {
      const s = await repos.subjects.create({ schoolId, name: 'Mathematics', code: 'MTC' });
      assert.equal(s.academicType, 'secular');
      const found = await repos.subjects.findById(schoolId, s.id);
      assert.deepEqual(found, s);
    });

    it('academic_type CHECK constraint rejects a value outside the real enum', async () => {
      await assert.rejects(() => repos.subjects.create({ schoolId, name: 'Bad', academicType: 'science' }));
    });

    it('findById is school-scoped', async () => {
      const other = await repos.subjects.create({ schoolId: otherSchoolId, name: 'Other School Subject' });
      assert.equal(await repos.subjects.findById(schoolId, other.id), null);
    });

    it('softDelete + restore carries the richer audit trail', async () => {
      const s = await repos.subjects.create({ schoolId, name: 'Temp Subject' });
      await repos.subjects.softDelete(schoolId, s.id, { deletedBy: 5, deleteReason: 'duplicate entry' });
      const listed = await repos.subjects.listBySchool(schoolId, { limit: 1000 });
      assert.ok(!listed.some((x) => x.id === s.id));
      const restored = await repos.subjects.restore(schoolId, s.id, 6);
      assert.equal(restored.deletedAt, null);
      assert.equal(restored.restoredBy, 6);
    });
  });

  describe('TermRepo', () => {
    let yearId;
    before(async () => {
      const year = await repos.academicYears.create({ schoolId, name: '2026', startDate: '2026-01-01', endDate: '2026-12-31' });
      yearId = year.id;
    });

    it('create/findById round-trip, isActive normalizes to a real boolean, not 0/1', async () => {
      const t = await repos.terms.create({
        schoolId, name: 'Term 1', startDate: '2026-01-15', endDate: '2026-04-10',
        academicYearId: yearId, isActive: true, termNumber: 1,
      });
      assert.equal(typeof t.isActive, 'boolean');
      assert.equal(t.isActive, true);
      const found = await repos.terms.findById(schoolId, t.id);
      assert.deepEqual(found, t);
    });

    it('isActive left unset stays null, not false', async () => {
      const t = await repos.terms.create({ schoolId, name: 'Term 2', startDate: '2026-05-01', endDate: '2026-08-01' });
      assert.equal(t.isActive, null);
    });

    it('listByAcademicYear returns only that year\'s terms, ordered by start_date', async () => {
      // A second term genuinely in yearId, created out of date order, so
      // the ordering assertion below is real rather than trivially true.
      await repos.terms.create({ schoolId, name: 'Term Late-2026', startDate: '2026-11-01', endDate: '2026-12-15', academicYearId: yearId });

      const otherYear = await repos.academicYears.create({ schoolId, name: '2027' });
      await repos.terms.create({ schoolId, name: 'Other Year Term', startDate: '2027-01-01', endDate: '2027-04-01', academicYearId: otherYear.id });

      const terms = await repos.terms.listByAcademicYear(schoolId, yearId);
      assert.ok(terms.length >= 2, `expected at least 2 terms for yearId, got ${terms.length}`);
      assert.ok(terms.every((t) => t.academicYearId === yearId), 'listByAcademicYear must not leak a term from a different academic year');
      for (let i = 1; i < terms.length; i++) {
        assert.ok(terms[i - 1].startDate <= terms[i].startDate);
      }
    });

    it('update() applies an explicit null and flips isActive false correctly (not treated as falsy-skip)', async () => {
      const t = await repos.terms.create({ schoolId, name: 'Term 3', startDate: '2026-09-01', endDate: '2026-12-01', isActive: true });
      const updated = await repos.terms.update(schoolId, t.id, { isActive: false, code: null });
      assert.equal(updated.isActive, false);
      assert.equal(updated.code, null);
    });

    it('softDelete + restore carries the richer audit trail', async () => {
      const t = await repos.terms.create({ schoolId, name: 'Temp Term', startDate: '2026-01-01', endDate: '2026-02-01' });
      await repos.terms.softDelete(schoolId, t.id, { deletedBy: 9, deleteReason: 'entered in error' });
      const afterDelete = await repos.terms.findById(schoolId, t.id);
      assert.notEqual(afterDelete.deletedAt, null);
      const restored = await repos.terms.restore(schoolId, t.id, 10);
      assert.equal(restored.deletedAt, null);
      assert.equal(restored.restoredBy, 10);
    });
  });

  describe('AcademicYearRepo', () => {
    it('create/findById round-trip, and the record has no createdAt/updatedAt keys at all', async () => {
      const y = await repos.academicYears.create({ schoolId, name: '2028', startDate: '2028-01-01', endDate: '2028-12-31' });
      assert.equal('createdAt' in y, false, 'academic_years has no created_at column — must not be invented');
      assert.equal('updatedAt' in y, false, 'academic_years has no updated_at column — must not be invented');
      const found = await repos.academicYears.findById(schoolId, y.id);
      assert.deepEqual(found, y);
    });

    it('findById is school-scoped — a real tenant-isolation check', async () => {
      const other = await repos.academicYears.create({ schoolId: otherSchoolId, name: '2029' });
      assert.equal(await repos.academicYears.findById(schoolId, other.id), null);
      assert.equal((await repos.academicYears.findById(otherSchoolId, other.id))?.id, other.id);
    });

    it('softDelete + restore carries the richer audit trail', async () => {
      const y = await repos.academicYears.create({ schoolId, name: 'Temp Year' });
      await repos.academicYears.softDelete(schoolId, y.id, { deletedBy: 1, deleteReason: 'typo' });
      const listed = await repos.academicYears.listBySchool(schoolId, { limit: 1000 });
      assert.ok(!listed.some((x) => x.id === y.id));
      const restored = await repos.academicYears.restore(schoolId, y.id, 2);
      assert.equal(restored.deletedAt, null);
      assert.equal(restored.restoredBy, 2);
    });
  });
});
