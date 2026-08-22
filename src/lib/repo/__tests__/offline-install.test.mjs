// Phase 7, sub-effort 10: "which school does this local install hold."
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSqliteDb, closeSqliteDb, createSqliteRepos } from '@/lib/repo/sqlite';
import { getLocalInstallSchoolId, LocalInstallSchoolError } from '@/lib/repo/offline-auth/install';

describe('getLocalInstallSchoolId', () => {
  it('throws NOT_PROVISIONED on a fresh, unprovisioned file', () => {
    const db = openSqliteDb(':memory:');
    try {
      assert.throws(() => getLocalInstallSchoolId(db), LocalInstallSchoolError);
      try { getLocalInstallSchoolId(db); } catch (e) { assert.equal(e.code, 'NOT_PROVISIONED'); }
    } finally { closeSqliteDb(db); }
  });

  it('returns the single school id once provisioned', async () => {
    const db = openSqliteDb(':memory:');
    try {
      const repos = createSqliteRepos(db);
      const school = await repos.schools.create({ name: 'The One School' });
      assert.equal(getLocalInstallSchoolId(db), school.id);
    } finally { closeSqliteDb(db); }
  });

  it('a soft-deleted school does not count — same as "no school"', async () => {
    const db = openSqliteDb(':memory:');
    try {
      const repos = createSqliteRepos(db);
      const school = await repos.schools.create({ name: 'Deleted School' });
      await repos.schools.softDelete(school.id);
      assert.throws(() => getLocalInstallSchoolId(db), LocalInstallSchoolError);
    } finally { closeSqliteDb(db); }
  });

  it('throws MULTIPLE_SCHOOLS if the one-school invariant is somehow violated', async () => {
    const db = openSqliteDb(':memory:');
    try {
      const repos = createSqliteRepos(db);
      await repos.schools.create({ name: 'School A' });
      await repos.schools.create({ name: 'School B' });
      try { getLocalInstallSchoolId(db); assert.fail('must throw'); }
      catch (e) { assert.equal(e.code, 'MULTIPLE_SCHOOLS'); }
    } finally { closeSqliteDb(db); }
  });
});
