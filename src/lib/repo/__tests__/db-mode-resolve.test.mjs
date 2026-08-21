// Phase 7: the db-mode.ts three-way wiring. Tests getDbMode()'s pure
// env-driven resolution logic and getActiveRepos()'s local-sqlite branch
// end-to-end. Deliberately never calls setDbMode() — it mutates a
// module-level singleton (db-mode.ts's runtimeMode) that would otherwise
// leak across whatever other test files share this process; every case
// here drives getDbMode() through env vars only, restored in after().
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getDbMode, isLocalAllowed } from '@/lib/db/db-mode';
import { getActiveRepos } from '@/lib/repo/resolve';

const ENV_KEYS = ['DRAIS_ALLOW_LOCAL', 'DRAIS_DB_MODE', 'DRAIS_SQLITE_PATH'];
let saved = {};

before(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});

after(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

function withEnv(vars, fn) {
  const prev = {};
  for (const k of ENV_KEYS) prev[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    return fn();
  } finally {
    for (const k of ENV_KEYS) delete process.env[k];
    for (const k of ENV_KEYS) if (prev[k] !== undefined) process.env[k] = prev[k];
  }
}

describe('db-mode: getDbMode() env-driven resolution', () => {
  it('DRAIS_ALLOW_LOCAL unset -> online, regardless of DRAIS_DB_MODE (hosted/prod hard-force)', () => {
    withEnv({ DRAIS_DB_MODE: 'local-sqlite' }, () => {
      assert.equal(isLocalAllowed(), false);
      assert.equal(getDbMode(), 'online');
    });
  });

  it('DRAIS_ALLOW_LOCAL=true, DRAIS_DB_MODE unset -> online (env default)', () => {
    withEnv({ DRAIS_ALLOW_LOCAL: 'true' }, () => {
      assert.equal(getDbMode(), 'online');
    });
  });

  it('DRAIS_DB_MODE=local (the pre-V2 value) maps to local-mysql, not a crash or online fallback', () => {
    withEnv({ DRAIS_ALLOW_LOCAL: 'true', DRAIS_DB_MODE: 'local' }, () => {
      assert.equal(getDbMode(), 'local-mysql');
    });
  });

  it('DRAIS_DB_MODE=local-mysql resolves explicitly', () => {
    withEnv({ DRAIS_ALLOW_LOCAL: 'true', DRAIS_DB_MODE: 'local-mysql' }, () => {
      assert.equal(getDbMode(), 'local-mysql');
    });
  });

  it('DRAIS_DB_MODE=local-sqlite resolves explicitly', () => {
    withEnv({ DRAIS_ALLOW_LOCAL: 'true', DRAIS_DB_MODE: 'local-sqlite' }, () => {
      assert.equal(getDbMode(), 'local-sqlite');
    });
  });
});

describe('repo/resolve: getActiveRepos() local-sqlite branch, end-to-end', () => {
  it('in local-sqlite mode, getActiveRepos() returns a genuinely working SQLite-backed Repos', async () => {
    await withEnv({ DRAIS_ALLOW_LOCAL: 'true', DRAIS_DB_MODE: 'local-sqlite', DRAIS_SQLITE_PATH: ':memory:' }, async () => {
      assert.equal(getDbMode(), 'local-sqlite');
      const repos = getActiveRepos();
      // Real round-trip through the resolver -> singleton -> repo-sqlite
      // pipeline, not just a type/identity check.
      const school = await repos.schools.create({ name: 'Resolver Test School' });
      const found = await repos.schools.findById(school.id);
      assert.equal(found?.name, 'Resolver Test School');
    });
  });
});
