/**
 * scripts/backfill-external-ids.mjs
 *
 * Assigns a stable UUID external_id to every school that doesn't have one.
 * Safe to run multiple times — only updates rows where external_id IS NULL.
 *
 * Usage:
 *   node scripts/backfill-external-ids.mjs
 *
 * Requires TIDB_HOST, TIDB_USER, TIDB_PASSWORD, TIDB_DB in .env.local
 */

import { createConnection } from 'mysql2/promise';
import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Load .env.local manually (no dotenv dependency needed) ──────────────────
function loadEnv() {
  const envPath = resolve(__dirname, '..', '.env.local');
  try {
    const raw = readFileSync(envPath, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && !process.env[key]) process.env[key] = val;
    }
    console.log('[ENV] Loaded .env.local');
  } catch {
    console.warn('[ENV] .env.local not found — relying on system environment');
  }
}

loadEnv();

// ── Connect ──────────────────────────────────────────────────────────────────
const conn = await createConnection({
  host:     process.env.TIDB_HOST,
  port:     parseInt(process.env.TIDB_PORT || '4000', 10),
  user:     process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DB,
  ssl: { rejectUnauthorized: false },
  connectTimeout: 15_000,
});

console.log('[DB] Connected to TiDB Cloud');

// ── Fetch schools without external_id ─────────────────────────────────────
const [schools] = await conn.execute(
  'SELECT id, name FROM schools WHERE external_id IS NULL ORDER BY id'
);

if (!schools.length) {
  console.log('[Backfill] All schools already have external_id. Nothing to do.');
  await conn.end();
  process.exit(0);
}

console.log(`[Backfill] Found ${schools.length} school(s) without external_id`);

// ── Assign UUID to each ────────────────────────────────────────────────────
let updated = 0;
for (const school of schools) {
  const externalId = randomUUID();
  const [result] = await conn.execute(
    'UPDATE schools SET external_id = ? WHERE id = ? AND external_id IS NULL',
    [externalId, school.id]
  );
  if (result.affectedRows > 0) {
    console.log(`  ✓ School #${school.id} "${school.name}" → ${externalId}`);
    updated++;
  } else {
    console.warn(`  ⚠ School #${school.id} skipped (race condition or already set)`);
  }
}

console.log(`\n[Backfill] Done. ${updated}/${schools.length} schools updated.`);

// ── Verify ─────────────────────────────────────────────────────────────────
const [remaining] = await conn.execute(
  'SELECT COUNT(*) AS cnt FROM schools WHERE external_id IS NULL'
);
const stillNull = remaining[0]?.cnt ?? 0;
if (Number(stillNull) > 0) {
  console.error(`[Backfill] WARNING: ${stillNull} school(s) still have NULL external_id`);
} else {
  console.log('[Backfill] ✅ All schools now have external_id');
}

await conn.end();
