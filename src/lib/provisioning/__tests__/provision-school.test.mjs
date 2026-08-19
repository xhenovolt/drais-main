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
  let sourceDb, source, schoolA, schoolB;

  before(async () => {
    // The fake "online" source: two schools, so leak-detection tests have
    // a second school's data to (deliberately, separately) test against.
    sourceDb = openSqliteDb(':memory:');
    source = createSqliteRepos(sourceDb);
    schoolA = await source.schools.create({ name: 'School A' });
    schoolB = await source.schools.create({ name: 'School B' });
    await source.students.create({ schoolId: schoolA.id, personId: 1, admissionNo: 'A-001' });
    await source.students.create({ schoolId: schoolA.id, personId: 2, admissionNo: 'A-002' });
    await source.students.create({ schoolId: schoolB.id, personId: 1, admissionNo: 'B-001' });
  });

  after(() => {
    closeSqliteDb(sourceDb);
  });

  it('provisions exactly one school\'s students into a fresh local file', async () => {
    const sqlitePath = tmpSqlitePath('happy');
    try {
      const result = await provisionSchool({ schoolId: schoolA.id, sqlitePath, source });
      assert.equal(result.counts.schools, 1);
      assert.equal(result.counts.students, 2);

      const verify = await verifyProvisionedSchool({ schoolId: schoolA.id, sqlitePath, source });
      assert.equal(verify.ok, true);
      assert.equal(verify.tenantIsolationVerified, true);
      assert.deepEqual(verify.leakedSchoolIds, []);
      assert.equal(verify.counts.students.matches, true);
      assert.equal(verify.counts.students.local, 2);
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
      schools: source.schools,
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
