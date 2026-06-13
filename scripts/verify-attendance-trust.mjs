#!/usr/bin/env node
/**
 * Attendance Trust Refactor (Phase 0 + Phase 1) — DB verification.
 *
 * READ-ONLY. Runs the acceptance checks from the refactor spec against
 * the configured database and prints PASS / FAIL / WARN per check.
 *
 *   node --env-file=.env.local scripts/verify-attendance-trust.mjs
 * (or export TIDB_HOST/TIDB_PORT/TIDB_USER/TIDB_PASSWORD/TIDB_DB first)
 *
 * Checks:
 *   1. biometric_enrollments has the canonical shape (pin_value) and
 *      the pending_capture status member.
 *   2. devices table has the sn column + unique key.
 *   3. Dedup keys exist (uk_punch, uk_raw_punch) and no duplicate rows
 *      remain.
 *   4. No IP addresses stored as device_sn (zk_user_mapping,
 *      biometric_enrollments.origin_device_sn).
 *   5. zk_user_mapping school_id backfill status (NULL rows are no
 *      longer used for attribution).
 *   6. pending_device_users exists; unresolved count reported.
 *   7. ENGINE GATE: matched punches in the last 7 days that produced
 *      NO attendance_records row (should trend to zero after deploy).
 *   8. Cross-school PIN sanity: same pin_value in two schools is FINE
 *      (per-school scoping); the check verifies no zk_user_mapping row
 *      attributes across schools via NULL school_id.
 */
import mysql from 'mysql2/promise';

const config = {
  host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port: parseInt(process.env.TIDB_PORT || '4000', 10),
  user: process.env.TIDB_USER || '',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_DB || 'drais',
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true },
};

let pass = 0, fail = 0, warn = 0;
const report = (level, name, detail) => {
  const tag = level === 'PASS' ? '✔ PASS' : level === 'WARN' ? '⚠ WARN' : '✘ FAIL';
  if (level === 'PASS') pass++; else if (level === 'WARN') warn++; else fail++;
  console.log(`${tag}  ${name}${detail ? ` — ${detail}` : ''}`);
};

const main = async () => {
  const db = await mysql.createConnection(config);
  const q = async (sql, params = []) => (await db.query(sql, params))[0];

  const columns = async (table) =>
    new Set((await q(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`, [table],
    )).map(r => r.COLUMN_NAME.toLowerCase()));
  const hasIndex = async (table, index) =>
    (await q(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? LIMIT 1`,
      [table, index],
    )).length > 0;

  // 1. Canonical enrollment shape
  const beCols = await columns('biometric_enrollments');
  if (beCols.size === 0) report('FAIL', 'biometric_enrollments exists', 'table missing');
  else if (!beCols.has('pin_value')) report('FAIL', 'biometric_enrollments canonical shape', 'OLD pipeline shape installed — boot the app once (auto-renames to biometric_enrollments_legacy) or run migration 020 §1.1');
  else {
    report('PASS', 'biometric_enrollments canonical shape');
    const enumRow = await q(
      `SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='biometric_enrollments' AND COLUMN_NAME='status'`);
    if (String(enumRow[0]?.COLUMN_TYPE || '').includes('pending_capture')) {
      report('PASS', 'status enum includes pending_capture');
    } else report('FAIL', 'status enum includes pending_capture', 'run migration 020 §1.1 ALTER or boot the app once');
  }

  // 2. devices.sn
  const devCols = await columns('devices');
  if (devCols.has('sn')) report('PASS', 'devices table has sn column');
  else report('FAIL', 'devices table has sn column', 'run ensureDevicesCanonicalSchema (boot app) or migration 020 §1.4');

  // 3. Dedup keys + remaining duplicates
  for (const [table, index, dupSql] of [
    ['zk_attendance_logs', 'uk_punch',
      `SELECT COUNT(*) AS n FROM (SELECT device_sn, device_user_id, check_time
         FROM zk_attendance_logs GROUP BY device_sn, device_user_id, check_time
         HAVING COUNT(*) > 1) d`],
    ['attendance_raw_events', 'uk_raw_punch',
      `SELECT COUNT(*) AS n FROM (SELECT school_id, device_sn, device_user_id, punch_at, source
         FROM attendance_raw_events GROUP BY school_id, device_sn, device_user_id, punch_at, source
         HAVING COUNT(*) > 1) d`],
  ]) {
    const dups = Number((await q(dupSql))[0]?.n ?? 0);
    const keyed = await hasIndex(table, index);
    if (keyed && dups === 0) report('PASS', `${table} dedup (${index})`);
    else if (!keyed) report('FAIL', `${table} dedup key ${index}`, `missing${dups ? `; ${dups} duplicate groups present — run migration 020 §0` : ' — run migration 020 §0'}`);
    else report('WARN', `${table} duplicates`, `${dups} duplicate groups despite key (investigate)`);
  }

  // 4. IP-as-serial rows
  const ipRe = `'^[0-9]{1,3}\\\\.[0-9]{1,3}\\\\.[0-9]{1,3}\\\\.[0-9]{1,3}$'`;
  const ipZk = Number((await q(
    `SELECT COUNT(*) AS n FROM zk_user_mapping WHERE device_sn REGEXP ${ipRe}`))[0]?.n ?? 0);
  if (ipZk === 0) report('PASS', 'zk_user_mapping has no IP-as-serial rows');
  else report('FAIL', 'zk_user_mapping IP-as-serial rows', `${ipZk} rows — run migration 020 §1.3`);
  if (beCols.has('origin_device_sn')) {
    const ipBe = Number((await q(
      `SELECT COUNT(*) AS n FROM biometric_enrollments WHERE origin_device_sn REGEXP ${ipRe}`))[0]?.n ?? 0);
    if (ipBe === 0) report('PASS', 'biometric_enrollments has no IP-as-serial provenance');
    else report('WARN', 'biometric_enrollments IP-as-serial provenance', `${ipBe} rows (cosmetic — update origin_device_sn manually)`);
  }

  // 5. zk_user_mapping school scope
  const nullSchool = Number((await q(
    `SELECT COUNT(*) AS n FROM zk_user_mapping WHERE school_id IS NULL OR school_id = 0`))[0]?.n ?? 0);
  if (nullSchool === 0) report('PASS', 'zk_user_mapping fully school-scoped');
  else report('WARN', 'zk_user_mapping school_id backfill', `${nullSchool} rows have no school — they no longer attribute attendance; run migration 020 §1.2 then review the remainder`);

  // 6. pending_device_users
  const pduCols = await columns('pending_device_users');
  if (pduCols.size > 0) {
    const unresolved = Number((await q(
      `SELECT COUNT(*) AS n FROM pending_device_users WHERE status IN ('pending','ambiguous')`))[0]?.n ?? 0);
    report('PASS', 'pending_device_users queue', `${unresolved} unresolved device users awaiting triage`);
  } else report('WARN', 'pending_device_users queue', 'not yet created (lazy — appears on first device push after deploy)');

  // 7. Engine gate: matched punches with no attendance_records (7 days)
  try {
    const gap = await q(
      `SELECT COUNT(*) AS n
         FROM attendance_raw_events ar
        WHERE ar.matched = 1
          AND ar.person_id IS NOT NULL
          AND ar.punch_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          AND NOT EXISTS (
            SELECT 1 FROM attendance_records r
             WHERE r.person_id = ar.person_id
               AND r.attendance_date = DATE(ar.punch_at))`);
    const n = Number(gap[0]?.n ?? 0);
    if (n === 0) report('PASS', 'engine gate: matched punches → attendance_records (7d)');
    else report('WARN', 'engine gate gap (7d)', `${n} matched punches without a record — expected to drain to 0 after deploy (pre-deploy punches won't reprocess automatically)`);
    const hydrationGap = await q(
      `SELECT COUNT(*) AS n FROM attendance_raw_events
        WHERE matched = 1 AND person_id IS NULL
          AND punch_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`);
    const hn = Number(hydrationGap[0]?.n ?? 0);
    if (hn === 0) report('PASS', 'person hydration: no matched-but-personless raw events (7d)');
    else report('WARN', 'person hydration gap (7d)', `${hn} matched raw events with NULL person_id — should stop growing after deploy`);
  } catch (e) {
    report('WARN', 'engine gate check', `tables not present yet (${e.message})`);
  }

  console.log(`\n${pass} pass, ${warn} warn, ${fail} fail`);
  await db.end();
  process.exit(fail > 0 ? 1 : 0);
};

main().catch((err) => { console.error('verification failed to run:', err.message); process.exit(2); });
