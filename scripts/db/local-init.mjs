#!/usr/bin/env node
/**
 * db:local:init — create the local MySQL database and apply the exported schema.
 *
 *   npm run db:local:init                 # uses newest database/exports/*.sql
 *   npm run db:local:init -- --file <path>
 *
 * Reads LOCAL_MYSQL_* from .env.local. Creates the database if missing, applies
 * the schema, then verifies tables + schema_migrations. Idempotent: the export
 * uses DROP TABLE IF EXISTS so re-running re-applies cleanly.
 */
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { loadEnv, localConfig, EXPORTS_DIR } from './_shared.mjs';

loadEnv();

function optFile() {
  const i = process.argv.indexOf('--file');
  if (i !== -1 && process.argv[i + 1]) return path.resolve(process.argv[i + 1]);
  if (!fs.existsSync(EXPORTS_DIR)) return null;
  const files = fs.readdirSync(EXPORTS_DIR).filter((f) => f.endsWith('.sql'))
    .map((f) => ({ f, t: fs.statSync(path.join(EXPORTS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(EXPORTS_DIR, files[0].f) : null;
}

async function main() {
  const file = optFile();
  if (!file || !fs.existsSync(file)) {
    console.error('FATAL: no schema export found. Run: npm run db:export:schema');
    process.exit(1);
  }
  const dbName = process.env.LOCAL_MYSQL_DATABASE || 'drais_local';
  const server = localConfig(false);
  console.log(`[local-init] Server ${server.host}:${server.port} as ${server.user}`);

  // 1. Create the database.
  const root = await mysql.createConnection(server);
  await root.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await root.end();
  console.log(`[local-init] Database ready: ${dbName}`);

  // 2. Apply the schema.
  console.log(`[local-init] Applying ${path.basename(file)} …`);
  const conn = await mysql.createConnection({ ...localConfig(true), database: dbName });
  const sql = fs.readFileSync(file, 'utf8');
  await conn.query(sql); // multipleStatements enabled in localConfig
  console.log('[local-init] Schema applied.');

  // 3. Verify.
  const [[{ n: tableCount }]] = await conn.query(
    'SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema = ?', [dbName],
  );
  let migrations = 0;
  try { const [[m]] = await conn.query('SELECT COUNT(*) n FROM schema_migrations'); migrations = m.n; } catch {}
  await conn.end();

  console.log(`\n✅ Local DB '${dbName}' initialised: ${tableCount} tables, ${migrations} migration ledger rows.`);
  console.log(`\nNext steps:`);
  console.log(`  1. In .env.local set:  DRAIS_ALLOW_LOCAL=true  (enables the Local switch)`);
  console.log(`  2. Verify any time:    npm run db:local:verify`);
  console.log(`  3. In the app, pick "Local Server" on the login screen / navbar.`);
}

main().catch((e) => { console.error('[local-init] FAILED:', e.message); process.exit(1); });
