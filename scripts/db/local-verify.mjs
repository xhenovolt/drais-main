#!/usr/bin/env node
/**
 * db:local:verify — sanity-check the local MySQL database.
 *
 * Confirms the server is reachable, the database exists, core tables are
 * present, and reports the schema_migrations ledger state. Exits non-zero if
 * anything critical is missing so it can gate a packaged-app boot.
 */
import mysql from 'mysql2/promise';
import { loadEnv, localConfig } from './_shared.mjs';

loadEnv();

const CORE_TABLES = ['schools', 'users', 'students', 'roles', 'permissions', 'schema_migrations'];

async function main() {
  const dbName = process.env.LOCAL_MYSQL_DATABASE || 'drais';
  let conn;
  try {
    conn = await mysql.createConnection({ ...localConfig(true), database: dbName });
  } catch (e) {
    console.error(`❌ Cannot connect to local '${dbName}': ${e.message}`);
    console.error(`   Check LOCAL_MYSQL_* in .env.local and that MySQL is running. Run db:local:init first.`);
    process.exit(1);
  }

  const [[{ n: tableCount }]] = await conn.query(
    'SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = ?', [dbName],
  );
  console.log(`Local DB: ${dbName} @ ${localConfig(false).host}`);
  console.log(`Tables: ${tableCount}`);

  let missing = [];
  for (const t of CORE_TABLES) {
    const [r] = await conn.query(
      'SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = ? AND table_name = ?', [dbName, t],
    );
    const ok = r[0].n > 0;
    if (!ok) missing.push(t);
    console.log(`  ${ok ? '✓' : '✗'} ${t}`);
  }

  let ledger = 'absent';
  try {
    const [rows] = await conn.query('SELECT COUNT(*) n, MAX(applied_at) last FROM schema_migrations');
    ledger = `${rows[0].n} applied (last: ${rows[0].last || 'n/a'})`;
  } catch { /* table missing — reported above */ }
  console.log(`schema_migrations: ${ledger}`);
  await conn.end();

  if (missing.length) {
    console.error(`\n❌ Missing core tables: ${missing.join(', ')}. Run: npm run db:local:init`);
    process.exit(1);
  }
  console.log(`\n✅ Local database looks healthy.`);
}

main().catch((e) => { console.error('[local-verify] FAILED:', e.message); process.exit(1); });
