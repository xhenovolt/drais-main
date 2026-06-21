#!/usr/bin/env node
/**
 * Applies sql/parent_portal.sql against the configured TiDB database.
 * Idempotent (CREATE TABLE IF NOT EXISTS).
 *
 * Run: node scripts/apply-parent-portal-migration.mjs
 * Loads credentials from .env.local (TIDB_*), same as src/lib/db.ts.
 */
import { createConnection } from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// Minimal .env.local loader (no extra deps).
try {
  const env = await readFile(join(root, '.env.local'), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
} catch { /* env may already be exported */ }

const cfg = {
  host:     process.env.TIDB_HOST,
  port:     parseInt(process.env.TIDB_PORT || '4000', 10),
  user:     process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DB || 'drais',
  ssl:      { rejectUnauthorized: false },
  connectTimeout: 15000,
  multipleStatements: true,
};

if (!cfg.host || !cfg.user || !cfg.password) {
  console.error('FATAL: TIDB_HOST / TIDB_USER / TIDB_PASSWORD not found in env or .env.local');
  process.exit(1);
}

const sql = await readFile(join(root, 'sql', 'parent_portal.sql'), 'utf8');
const conn = await createConnection(cfg);
console.log('[migration] Applying sql/parent_portal.sql …');
await conn.query(sql);

const tables = ['parent_accounts', 'parent_sessions', 'parent_otp_codes', 'parent_student_links'];
const [rows] = await conn.query(
  `SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN (?, ?, ?, ?)
    ORDER BY TABLE_NAME`,
  [cfg.database, ...tables],
);
console.log('[migration] Tables present:');
for (const r of rows) console.log(`  ✓ ${r.TABLE_NAME}`);
const found = new Set(rows.map(r => r.TABLE_NAME));
const missing = tables.filter(t => !found.has(t));
if (missing.length) { console.error('[migration] STILL MISSING:', missing); process.exit(1); }

await conn.end();
console.log('[migration] Done — all 4 parent-portal tables exist.');
