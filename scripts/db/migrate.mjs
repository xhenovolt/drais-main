#!/usr/bin/env node
/**
 * DRAIS migration runner — Phase 2B.
 *
 * Applies the managed migrations in database/migrations/tidb/ against
 * the configured database, recording every run in schema_migrations.
 *
 *   node --env-file=.env.local scripts/db/migrate.mjs --status
 *   node --env-file=.env.local scripts/db/migrate.mjs --dry-run
 *   node --env-file=.env.local scripts/db/migrate.mjs
 *   node --env-file=.env.local scripts/db/migrate.mjs --database drais_phase2_rehearsal
 *
 * Design:
 *   - Migrations are .sql (statement-per-statement, idempotency-error
 *     tolerant) or .mjs (export default async ({ query }) => {...})
 *     for logic SQL can't express (conditional renames, batched
 *     dedupe).
 *   - Ledger: schema_migrations (id, migration_name, checksum,
 *     applied_at, applied_by, environment, execution_time_ms, status,
 *     error_message). One ledger per database — local and TiDB Cloud
 *     each keep their own history.
 *   - A successfully applied migration never re-runs. A checksum
 *     mismatch on an applied migration aborts (edit-after-apply is a
 *     new migration, not an edit) unless --allow-checksum-drift.
 *   - Failed runs are recorded with status='failed' and re-attempted
 *     on the next invocation.
 *   - Tolerated error codes for .sql statements (idempotent re-runs):
 *       1050 table exists, 1060 duplicate column, 1061 duplicate key
 *       name, 1091 can't drop (already gone), 8200 TiDB unsupported
 *       no-op variants are NOT tolerated — they fail loudly.
 *   - Credentials come from env vars only and are never printed.
 *
 * Runtime ensure* modules remain as DEFENSIVE FALLBACK only; this
 * runner is the production schema strategy from Phase 2 onward.
 */
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';
import mysql from 'mysql2/promise';

const MIGRATIONS_DIR = resolve(process.cwd(), 'database/migrations/tidb');
const TOLERATED_SQL_ERRNOS = new Set([1050, 1060, 1061, 1091]);

// ── CLI args ───────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : null;
};
const DRY_RUN = flag('--dry-run');
const STATUS_ONLY = flag('--status');
const ALLOW_DRIFT = flag('--allow-checksum-drift');

const cfg = {
  host: process.env.TIDB_HOST,
  port: parseInt(process.env.TIDB_PORT || '4000', 10),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: opt('--database') || process.env.TIDB_DB || 'drais',
  ssl: { rejectUnauthorized: false },
  multipleStatements: false,
};
if (!cfg.host || !cfg.user || !cfg.password) {
  console.error('TIDB_HOST / TIDB_USER / TIDB_PASSWORD must be set (use --env-file=.env.local)');
  process.exit(2);
}
const maskHost = (h) => (h && h.length > 18 ? `${h.slice(0, 9)}…${h.slice(-8)}` : '…');
const environmentTag = `${maskHost(cfg.host)}/${cfg.database}`;

// ── SQL splitting (naive but sufficient: statements end with ; at EOL,
//    no stored procedures in our migration set) ────────────────────────
function splitSql(sql) {
  return sql
    .split(/;\s*(?:\r?\n|$)/)
    .map(s => s
      .split('\n')
      .filter(line => !/^\s*--/.test(line))
      .join('\n')
      .trim())
    .filter(s => s.length > 0);
}

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function ensureLedger(q) {
  await q(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id                BIGINT PRIMARY KEY AUTO_INCREMENT,
    migration_name    VARCHAR(255) NOT NULL,
    checksum          CHAR(64) NOT NULL,
    applied_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    applied_by        VARCHAR(120) DEFAULT NULL,
    environment       VARCHAR(160) DEFAULT NULL,
    execution_time_ms INT DEFAULT NULL,
    status            ENUM('success','failed') NOT NULL,
    error_message     TEXT DEFAULT NULL,
    UNIQUE KEY uk_name_success (migration_name, status),
    KEY idx_name (migration_name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

const main = async () => {
  const conn = await mysql.createConnection(cfg);
  const q = async (sql, params = []) => (await conn.query(sql, params))[0];

  console.log(`migration target: ${environmentTag}`);
  const activeDb = (await q('SELECT DATABASE() d'))[0].d;
  if (activeDb !== cfg.database) {
    console.error(`connected to wrong database '${activeDb}' (expected '${cfg.database}')`);
    process.exit(2);
  }

  await ensureLedger(q);

  const files = (await readdir(MIGRATIONS_DIR))
    .filter(f => /^\d+.*\.(sql|mjs)$/.test(f))
    .sort();

  const ledger = await q(`SELECT migration_name, checksum, status FROM schema_migrations`);
  const applied = new Map();
  for (const r of ledger) {
    if (r.status === 'success') applied.set(r.migration_name, r.checksum);
  }

  const pending = [];
  for (const f of files) {
    const body = await readFile(join(MIGRATIONS_DIR, f));
    const checksum = sha256(body);
    if (applied.has(f)) {
      if (applied.get(f) !== checksum && !ALLOW_DRIFT) {
        console.error(`✘ ${f}: checksum drift — file edited after being applied. Create a NEW migration instead (or pass --allow-checksum-drift to acknowledge).`);
        process.exit(1);
      }
      continue;
    }
    pending.push({ name: f, body, checksum });
  }

  console.log(`migrations on disk: ${files.length}; applied: ${files.length - pending.length}; pending: ${pending.length}`);
  for (const p of pending) console.log('  pending:', p.name);
  if (STATUS_ONLY || DRY_RUN || pending.length === 0) {
    await conn.end();
    return;
  }

  for (const m of pending) {
    const started = Date.now();
    console.log(`\n▶ applying ${m.name} …`);
    try {
      if (m.name.endsWith('.sql')) {
        const statements = splitSql(m.body.toString('utf8'));
        for (const stmt of statements) {
          try {
            await q(stmt);
          } catch (err) {
            if (TOLERATED_SQL_ERRNOS.has(err.errno)) {
              console.log(`   ↷ tolerated (${err.errno}): ${stmt.slice(0, 70).replace(/\s+/g, ' ')}…`);
              continue;
            }
            throw err;
          }
        }
      } else {
        const mod = await import(pathToFileURL(join(MIGRATIONS_DIR, m.name)).href);
        await mod.default({ query: q, conn, database: cfg.database, log: (...a) => console.log('  ', ...a) });
      }
      const ms = Date.now() - started;
      // Clear any prior failed record for this migration, then record success.
      await q(`DELETE FROM schema_migrations WHERE migration_name = ? AND status = 'failed'`, [m.name]);
      await q(
        `INSERT INTO schema_migrations
           (migration_name, checksum, applied_by, environment, execution_time_ms, status)
         VALUES (?, ?, ?, ?, ?, 'success')`,
        [m.name, m.checksum, `${os.userInfo().username}@migrate.mjs`, environmentTag, ms],
      );
      console.log(`✔ ${m.name} applied in ${ms}ms`);
    } catch (err) {
      const ms = Date.now() - started;
      const msg = (err && err.message ? err.message : String(err)).slice(0, 2000);
      await q(`DELETE FROM schema_migrations WHERE migration_name = ? AND status = 'failed'`, [m.name]).catch(() => {});
      await q(
        `INSERT INTO schema_migrations
           (migration_name, checksum, applied_by, environment, execution_time_ms, status, error_message)
         VALUES (?, ?, ?, ?, ?, 'failed', ?)`,
        [m.name, m.checksum, `${os.userInfo().username}@migrate.mjs`, environmentTag, ms, msg],
      ).catch(() => {});
      console.error(`✘ ${m.name} FAILED after ${ms}ms: ${msg}`);
      console.error('  Aborting — later migrations may depend on this one.');
      await conn.end();
      process.exit(1);
    }
  }

  console.log('\nall pending migrations applied.');
  await conn.end();
};
main().catch((e) => { console.error('runner failed:', e.message); process.exit(1); });
