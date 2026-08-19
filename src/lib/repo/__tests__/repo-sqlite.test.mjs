// repo-sqlite parity + SQLite-specific behavior.
// Runs entirely against an in-process ':memory:' database — no filesystem
// state, no external dependency, safe to run anywhere/anytime (same
// property scripts/sentinel/architecture-scan.mjs already relies on for
// its own DB-free design).
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import { runRepoContractSuite } from './contract-assertions.mjs';

describe('repo-sqlite', () => {
  let db, repos, schoolId;

  before(async () => {
    db = openSqliteDb(':memory:');
    repos = createSqliteRepos(db);
    const school = await repos.schools.create({ name: 'Parity Test School' });
    schoolId = school.id;
  });

  after(() => {
    closeSqliteDb(db);
  });

  it('shared repo contract', async (t) => {
    await runRepoContractSuite(t, repos, schoolId);
  });

  it('duplicate admission_no is a RepoError with code DUPLICATE, not a raw driver exception', async () => {
    const admissionNo = `DUPE-${Date.now()}`;
    await repos.students.create({ schoolId, personId: 1, admissionNo });
    await assert.rejects(
      () => repos.students.create({ schoolId, personId: 2, admissionNo }),
      (err) => err.name === 'RepoError' && err.code === 'DUPLICATE',
    );
  });

  it('school not found returns null from findById, never throws', async () => {
    const found = await repos.schools.findById(999999);
    assert.equal(found, null);
  });

  it('ensureSchema is idempotent — opening a second connection to the same file does not error', () => {
    // A throwaway file this time, specifically to prove CREATE TABLE IF NOT
    // EXISTS behavior survives a real second connection, not just a second
    // call on the same in-memory handle.
    const filePath = path.join(os.tmpdir(), `drais-repo-parity-${Date.now()}.sqlite`);
    const db1 = openSqliteDb(filePath);
    assert.doesNotThrow(() => {
      const db2 = openSqliteDb(filePath);
      closeSqliteDb(db2);
    });
    closeSqliteDb(db1);
    for (const suffix of ['', '-wal', '-shm']) {
      const p = filePath + suffix;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });
});
