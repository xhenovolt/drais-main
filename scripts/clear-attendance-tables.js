#!/usr/bin/env node
/**
 * Truncate all attendance/biometric/device-sync operational tables in TiDB.
 * Leaves school, student, staff, people, class data completely untouched.
 *
 * Run:
 *   node scripts/clear-attendance-tables.js            ← shows plan, asks confirm
 *   node scripts/clear-attendance-tables.js --confirm  ← executes
 */

'use strict';

const mysql  = require('mysql2/promise');
const fs     = require('fs');
const path   = require('path');
const readline = require('readline');

// ── Load .env.local manually ──────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) throw new Error('.env.local not found');
  const lines = fs.readFileSync(envPath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const CONFIG = {
  host:               process.env.TIDB_HOST     || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port:         parseInt(process.env.TIDB_PORT   || '4000', 10),
  user:               process.env.TIDB_USER      || '',
  password:           process.env.TIDB_PASSWORD  || '',
  database:           process.env.TIDB_DB        || 'drais',
  ssl: { rejectUnauthorized: false },
  multipleStatements: false,
};

// ── Tables to clear (operational/log data only) ───────────────────────────────
// ORDER matters: child tables first, then parents.
// Tables marked (* schema/reference) are skipped.
const TABLES_TO_CLEAR = [
  // ── attendance logs & punches ──────────────────────────────────────────────
  'zk_attendance_logs',
  'zk_parsed_logs',
  'zk_raw_logs',
  'zk_device_logs',
  'system_logs',
  'enrollment_log',

  // ── device command queue ───────────────────────────────────────────────────
  'zk_device_commands',
  'relay_commands',

  // ── user sync & mapping ────────────────────────────────────────────────────
  'zk_user_mapping',
  'device_users',
  'device_sync_state',

  // ── biometric enrollment state machine ────────────────────────────────────
  'biometric_enrollments',
  'enrollment_sessions',

  // ── fingerprint templates ──────────────────────────────────────────────────
  'student_fingerprints',

  // ── device heartbeat state (not the devices registry) ─────────────────────
  // 'devices' — SKIP: we want to keep device SN registrations
];

async function tableExists(conn, name) {
  const [rows] = await conn.execute(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.tables
     WHERE table_schema = ? AND table_name = ?`,
    [CONFIG.database, name],
  );
  return Number(rows[0].cnt) > 0;
}

async function getRowCount(conn, name) {
  try {
    const [rows] = await conn.execute(`SELECT COUNT(*) AS cnt FROM \`${name}\``);
    return Number(rows[0].cnt);
  } catch { return -1; }
}

async function main() {
  const CONFIRM = process.argv.includes('--confirm');

  console.log(`\n${'─'.repeat(60)}`);
  console.log('  DRAIS Attendance Table Cleaner');
  console.log(`  Target: ${CONFIG.database} @ ${CONFIG.host}:${CONFIG.port}`);
  console.log(`${'─'.repeat(60)}\n`);

  const conn = await mysql.createConnection(CONFIG);
  console.log(`✓ Connected to TiDB (${CONFIG.database})\n`);

  // Check which tables actually exist and get row counts
  const plan = [];
  for (const t of TABLES_TO_CLEAR) {
    const exists = await tableExists(conn, t);
    if (exists) {
      const rows = await getRowCount(conn, t);
      plan.push({ table: t, rows });
    } else {
      plan.push({ table: t, rows: null, missing: true });
    }
  }

  console.log('Plan — tables to TRUNCATE:');
  for (const p of plan) {
    if (p.missing) {
      console.log(`  [SKIP - not found]  ${p.table}`);
    } else {
      console.log(`  [${String(p.rows).padStart(6)} rows]  ${p.table}`);
    }
  }

  const toDelete = plan.filter(p => !p.missing);
  const totalRows = toDelete.reduce((s, p) => s + (p.rows || 0), 0);
  console.log(`\nTotal: ${toDelete.length} tables, ~${totalRows} rows to delete.\n`);

  if (!CONFIRM) {
    console.log('─────────────────────────────────────────────');
    console.log('  DRY RUN — nothing changed.');
    console.log('  Re-run with --confirm to execute.');
    console.log('─────────────────────────────────────────────\n');
    await conn.end();
    return;
  }

  // Double-check: require explicit "yes" if running in terminal
  if (process.stdout.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve =>
      rl.question(`\nType "yes" to permanently delete ${totalRows} rows: `, resolve)
    );
    rl.close();
    if (answer.trim().toLowerCase() !== 'yes') {
      console.log('Aborted.');
      await conn.end();
      return;
    }
  }

  console.log('\nExecuting…');

  // Disable FK checks for the session so TRUNCATE doesn't fail on constraints
  await conn.execute('SET FOREIGN_KEY_CHECKS = 0');

  let cleared = 0;
  for (const p of toDelete) {
    try {
      await conn.execute(`DELETE FROM \`${p.table}\``);
      console.log(`  ✓ ${p.table}  (${p.rows} rows removed)`);
      cleared++;
    } catch (err) {
      console.error(`  ✗ ${p.table}  ERROR: ${err.message}`);
    }
  }

  await conn.execute('SET FOREIGN_KEY_CHECKS = 1');
  await conn.end();

  console.log(`\n✓ Done. Cleared ${cleared}/${toDelete.length} tables.\n`);
}

main().catch(err => {
  console.error('\nFATAL:', err.message);
  process.exit(1);
});
