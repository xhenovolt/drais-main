// Phase 4 tests. The "source" (standing in for the real online repo-mysql)
// is itself a second in-memory repo-sqlite instance — this is a deliberate,
// stated choice (see provision-school.ts's header): no live MySQL/TiDB
// connection is available in this environment, and this suite does not
// pretend otherwise. What IS fully, honestly exercised here: the real
// seeding/upsert path against real SQLite, and — the property this phase
// actually exists to prove — that a tenant-isolation leak is caught, not
// silently missed.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openSqliteDb, closeSqliteDb, createSqliteRepos, seedSchool } from '@/lib/repo/sqlite';
import { provisionSchool } from '@/lib/provisioning/provision-school';
import { verifyProvisionedSchool } from '@/lib/provisioning/verify';

function tmpSqlitePath(name) {
  return path.join(os.tmpdir(), `drais-provisioning-${name}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`);
}

function cleanupSqlite(p) {
  // Best-effort only. On Windows, a just-closed SQLite handle (especially
  // in WAL mode, and more so when a test opened a second short-lived
  // connection to the same file) can hold the file briefly locked past
  // db.close() returning — an EBUSY here is an OS-timing artifact, not a
  // sign the test's actual assertions were wrong. A stray temp file in
  // os.tmpdir() is harmless; failing an otherwise-passing test on cleanup
  // is worse and misleading.
  for (const suffix of ['', '-wal', '-shm']) {
    const f = p + suffix;
    try { if (fs.existsSync(f)) fs.unlinkSync(f); } catch { /* ignore */ }
  }
}

describe('provisioning (Phase 4)', () => {
  let sourceDb, source, schoolA, schoolB, classA, studentA1;

  before(async () => {
    // The fake "online" source: two schools, so leak-detection tests have
    // a second school's data to (deliberately, separately) test against.
    sourceDb = openSqliteDb(':memory:');
    source = createSqliteRepos(sourceDb);
    schoolA = await source.schools.create({ name: 'School A' });
    schoolB = await source.schools.create({ name: 'School B' });

    // Real person rows — sub-effort 15 fixed a real bug where provisioning
    // never copied people at all, which this fixture's original bare
    // personId: 1/2 literals (no person ever created with that id) would
    // have hidden rather than caught, since nothing here ever checked
    // whether the referenced person actually existed.
    const p1 = await source.people.create({ schoolId: schoolA.id, firstName: 'Amina', lastName: 'A-One' });
    const p2 = await source.people.create({ schoolId: schoolA.id, firstName: 'Musa', lastName: 'A-Two' });
    const pB = await source.people.create({ schoolId: schoolB.id, firstName: 'Zawadi', lastName: 'B-One' });
    studentA1 = await source.students.create({ schoolId: schoolA.id, personId: p1.id, admissionNo: 'A-001' });
    await source.students.create({ schoolId: schoolA.id, personId: p2.id, admissionNo: 'A-002' });
    await source.students.create({ schoolId: schoolB.id, personId: pB.id, admissionNo: 'B-001' });

    const staffPerson = await source.people.create({ schoolId: schoolA.id, firstName: 'Grace', lastName: 'Teacher' });
    const staffA1 = await source.staff.create({ schoolId: schoolA.id, personId: staffPerson.id, staffNo: 'STF-A-001' });

    classA = await source.classes.create({ schoolId: schoolA.id, name: 'Senior 1' });
    // EnrollmentRepo/ClassSubjectRepo are read-only (no create() on either
    // contract) — inserted directly, same as every enrollment/class-subject
    // repo test does for the same reason.
    sourceDb.prepare(`INSERT INTO enrollments (student_id, class_id, status) VALUES (?, ?, 'active')`).run(studentA1.id, classA.id);

    // Sub-effort 17's provisioning extension: subjects/terms/academic_years/
    // departments/class_subjects. Without these, offline-academics and
    // offline-reports would resolve every name to null on a freshly
    // provisioned install — the same shape of gap sub-effort 15 already
    // fixed once for people.
    const yearA = await source.academicYears.create({ schoolId: schoolA.id, name: '2026' });
    const termA = await source.terms.create({ schoolId: schoolA.id, name: 'Term 1', academicYearId: yearA.id, startDate: '2026-01-01', endDate: '2026-04-01' });
    const subjectA = await source.subjects.create({ schoolId: schoolA.id, name: 'Mathematics' });
    const deptA = await source.departments.create({ schoolId: schoolA.id, name: 'Sciences' });
    sourceDb.prepare(`INSERT INTO class_subjects (class_id, subject_id, teacher_id, status) VALUES (?, ?, ?, 'active')`).run(classA.id, subjectA.id, staffA1.id);

    // Sub-effort 19's provisioning extension: attendance_rules. Without
    // it, a freshly-provisioned install can list students/staff but
    // marking always fails (recordOfflinePunch throws INVALID_INPUT with
    // no active rule, by design — it never invents one).
    sourceDb.prepare(
      `INSERT INTO attendance_rules (school_id, applies_to, boarding_scope, arrival_end_time, late_threshold_minutes, weekday_mask, is_active)
       VALUES (?, 'students', 'all', '07:30:00', 15, 127, 1)`,
    ).run(schoolA.id);
  });

  after(() => {
    closeSqliteDb(sourceDb);
  });

  it('provisions exactly one school\'s students, people, staff, classes and enrollments into a fresh local file', async () => {
    const sqlitePath = tmpSqlitePath('happy');
    try {
      const result = await provisionSchool({ schoolId: schoolA.id, sqlitePath, source });
      assert.equal(result.counts.schools, 1);
      assert.equal(result.counts.students, 2);
      assert.equal(result.counts.people, 3, '2 student-linked people + 1 staff-linked person');
      assert.equal(result.counts.staff, 1);
      assert.equal(result.counts.classes, 1);
      assert.equal(result.counts.enrollments, 1);
      assert.equal(result.counts.subjects, 1);
      assert.equal(result.counts.terms, 1);
      assert.equal(result.counts.academicYears, 1);
      assert.equal(result.counts.departments, 1);
      assert.equal(result.counts.classSubjects, 1);
      assert.equal(result.counts.attendanceRules, 1);

      // The actual bug this sub-effort found: a provisioned student must
      // be resolvable through its person, not just present as a row with
      // a person_id nothing points at.
      const localDb = openSqliteDb(sqlitePath);
      try {
        const local = createSqliteRepos(localDb);
        const localStudents = await local.students.listBySchool(schoolA.id);
        for (const s of localStudents) {
          const person = await local.people.findById(s.personId);
          assert.ok(person, `student ${s.id}'s person_id ${s.personId} must resolve to a real copied person row`);
        }

        // Sub-effort 17's own gap: a class_subjects row's subject/teacher
        // must resolve locally too, not just exist as floating ids.
        const allocations = await local.classSubjects.listActiveByClassId(schoolA.id, classA.id);
        assert.equal(allocations.length, 1);
        assert.ok(await local.subjects.findById(schoolA.id, allocations[0].subjectId), 'provisioned class_subjects.subject_id must resolve to a real copied subject');
        assert.ok(await local.staff.findById(schoolA.id, allocations[0].teacherId), 'provisioned class_subjects.teacher_id must resolve to a real copied staff row');

        // Sub-effort 19's own gap, proven end-to-end rather than just by
        // row count: a freshly-provisioned install must actually be able
        // to MARK attendance, not just show the rule exists.
        const { recordOfflinePunch } = await import('@/lib/repo/offline-attendance');
        const marked = await recordOfflinePunch(local, schoolA.id, studentA1.personId, 'student', new Date(2026, 9, 5, 7, 0, 0));
        assert.ok(['present', 'late'].includes(marked.status), 'a provisioned install must be able to evaluate a real punch, not just store the rule inertly');
      } finally {
        closeSqliteDb(localDb);
      }

      const verify = await verifyProvisionedSchool({ schoolId: schoolA.id, sqlitePath, source });
      assert.equal(verify.ok, true);
      assert.equal(verify.tenantIsolationVerified, true);
      assert.deepEqual(verify.leakedSchoolIds, []);
      assert.equal(verify.counts.students.matches, true);
      assert.equal(verify.counts.students.local, 2);
      assert.equal(verify.counts.staff.matches, true);
      assert.equal(verify.counts.staff.local, 1);
    } finally {
      cleanupSqlite(sqlitePath);
    }
  });

  it('re-provisioning the same school is idempotent (upsert, not duplicate)', async () => {
    const sqlitePath = tmpSqlitePath('idempotent');
    try {
      await provisionSchool({ schoolId: schoolA.id, sqlitePath, source });
      const second = await provisionSchool({ schoolId: schoolA.id, sqlitePath, source });
      assert.equal(second.counts.students, 2, 're-running provisioning must not duplicate rows');
    } finally {
      cleanupSqlite(sqlitePath);
    }
  });

  it('THE core property: verify catches a tenant-isolation leak that provisioning did not cause', async () => {
    // Simulate the exact failure mode this phase exists to prevent: some
    // OTHER bug (not this code) leaked a second school's rows into the
    // local file. Written directly to the SQLite file, bypassing
    // provisionSchool entirely — this is deliberately not testing "does
    // provisionSchool leak" (it doesn't, see the defense-in-depth test
    // below), it's testing "if a leak exists for ANY reason, does the
    // verifier notice." Seeds school B's own row too, not just the
    // student — the schema's FK constraint (students.school_id ->
    // schools.id) already refuses a student row for a school that isn't
    // present at all, a real defense worth knowing about, but this test
    // is for the broader case that constraint can't catch: a future buggy
    // adapter that copies a whole OTHER school's rows, schools row
    // included, into a file that's supposed to hold exactly one school.
    const sqlitePath = tmpSqlitePath('leak');
    try {
      await provisionSchool({ schoolId: schoolA.id, sqlitePath, source });

      const db = openSqliteDb(sqlitePath);
      seedSchool(db, schoolB);
      db.prepare(
        `INSERT INTO students (id, school_id, person_id, admission_no, status, created_at, updated_at)
         VALUES (99999, ?, 1, 'LEAKED', 'active', datetime('now'), datetime('now'))`,
      ).run(schoolB.id);
      closeSqliteDb(db);

      const verify = await verifyProvisionedSchool({ schoolId: schoolA.id, sqlitePath, source });
      assert.equal(verify.ok, false);
      assert.equal(verify.tenantIsolationVerified, false);
      assert.deepEqual(verify.leakedSchoolIds, [schoolB.id]);
      assert.ok(verify.problems.some((p) => /TENANT ISOLATION VIOLATION/.test(p)));
    } finally {
      cleanupSqlite(sqlitePath);
    }
  });

  it('provisionSchool itself refuses a source that returns a mismatched school_id (defense in depth)', async () => {
    const sqlitePath = tmpSqlitePath('defense');
    const poisonedSource = {
      ...source,
      students: {
        ...source.students,
        // A deliberately buggy/malicious source: asked for school A's
        // students, hands back one tagged with school B's id.
        async listBySchool(_schoolId, opts) {
          const real = await source.students.listBySchool(schoolA.id, opts);
          return [...real, { ...real[0], id: 88888, schoolId: schoolB.id }];
        },
      },
    };
    try {
      await assert.rejects(
        () => provisionSchool({ schoolId: schoolA.id, sqlitePath, source: poisonedSource }),
        /not the requested/i,
      );
    } finally {
      cleanupSqlite(sqlitePath);
    }
  });

  it('provisioning a school that does not exist in the source throws a clear error', async () => {
    const sqlitePath = tmpSqlitePath('missing');
    try {
      await assert.rejects(
        () => provisionSchool({ schoolId: 999999, sqlitePath, source }),
        /not found in the source/i,
      );
    } finally {
      cleanupSqlite(sqlitePath);
    }
  });
});
