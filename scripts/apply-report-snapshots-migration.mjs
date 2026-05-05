#!/usr/bin/env node
/**
 * Applies sql/report_snapshots.sql against the configured TiDB database.
 * Idempotent — uses CREATE TABLE IF NOT EXISTS.
 *
 * Run: node scripts/apply-report-snapshots-migration.mjs
 *
 * Reads credentials from env (TIDB_HOST, TIDB_PORT, TIDB_USER, TIDB_PASSWORD,
 * TIDB_DB), falling back to the same defaults used by src/lib/db.ts.
 */
import { createConnection } from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(__dirname, '..', 'sql', 'report_snapshots.sql');

const cfg = {
  host:     process.env.TIDB_HOST     || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port:     parseInt(process.env.TIDB_PORT || '4000', 10),
  user:     process.env.TIDB_USER     || '',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_DB       || 'drais',
  ssl:      { rejectUnauthorized: false },
  connectTimeout: 15000,
};

if (!cfg.user || !cfg.password) {
  console.error('FATAL: TIDB_USER and TIDB_PASSWORD must be set.');
  process.exit(1);
}

const sql = await readFile(sqlPath, 'utf8');
const conn = await createConnection(cfg);
console.log(`[migration] Applying ${sqlPath}`);
await conn.query(sql);
const [rows] = await conn.query(
  "SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_NAME = 'report_snapshots' AND TABLE_SCHEMA = ?",
  [cfg.database],
);
console.log('[migration] Verification:', rows);
await conn.end();
console.log('[migration] Done.');
