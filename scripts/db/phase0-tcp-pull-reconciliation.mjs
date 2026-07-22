#!/usr/bin/env node
/**
 * Phase 0 — TCP Pull data reconciliation (see docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md)
 *
 * Repairs exactly two verified defects, nothing else:
 *
 *  1. TENANCY — devices.sn GED7254601154 is physically at JIPRA (school 12004)
 *     but registered under school 12011 (operator-confirmed 2026-07-22).
 *     Moves the devices row; historical raw events under 12011 are NOT touched.
 *
 *  2. IDENTITY — the 206 rows from the 2026-07-17 TCP pull (source='manual',
 *     school 12004, this device) stored device_reported_time as a copy of
 *     punch_at (UTC instant) instead of the device wall-clock. The wall clock
 *     is recoverable exactly: punch_at + 180 min (EAT). Without this repair,
 *     any future re-pull writes the true wall identity → uk_raw_identity does
 *     NOT collapse → the same physical punches import twice.
 *     Guard: only rows WHERE device_reported_time = punch_at are touched.
 *     The uniform shift is bijective, so identity uniqueness is preserved.
 *
 * Preflight findings baked into the guards:
 *   - zero overlap with zkteco_push rows (exact and ±90s) → repair, not discard
 *   - punch_at instants verified correct → NOT modified
 *
 * Dry-run by default. --apply executes inside a transaction after writing
 * JSON backups + restore SQL to backups/phase0-<ts>/.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';

const APPLY = process.argv.includes('--apply');
const SN = 'GED7254601154';
const FROM_SCHOOL = 12011;
const TO_SCHOOL = 12004;
const OFFSET_MIN = 180; // EAT

const conn = await mysql.createConnection({
  host: process.env.TIDB_HOST, port: Number(process.env.TIDB_PORT || 4000),
  user: process.env.TIDB_USER, password: process.env.TIDB_PASSWORD,
  database: process.env.TIDB_DB || 'drais',
  ssl: { minVersion: 'TLSv1.2', rejectUnauthorized: true }, timezone: 'Z',
});

// ── Preflight re-verification (abort if the world changed since the audit) ──
const [devRows] = await conn.query(
  `SELECT id, sn, school_id, lan_ip FROM devices WHERE sn = ?`, [SN]);
if (devRows.length !== 1) { console.error(`ABORT: expected exactly 1 devices row for ${SN}, found ${devRows.length}`); process.exit(1); }
const dev = devRows[0];
const tenancyNeeded = dev.school_id === FROM_SCHOOL;
if (!tenancyNeeded && dev.school_id !== TO_SCHOOL) {
  console.error(`ABORT: device is under unexpected school ${dev.school_id}`); process.exit(1);
}

const [idRows] = await conn.query(
  `SELECT id, device_user_id, punch_at, device_reported_time
     FROM attendance_raw_events
    WHERE source='manual' AND device_sn = ? AND school_id = ?
      AND device_reported_time = punch_at`, [SN, TO_SCHOOL]);
console.log(`devices row: id=${dev.id} school=${dev.school_id} (tenancy fix ${tenancyNeeded ? 'NEEDED → ' + TO_SCHOOL : 'already done'})`);
console.log(`identity-corrupted rows (reported == punch_at): ${idRows.length}`);

const [overlap] = await conn.query(
  `SELECT COUNT(*) c FROM attendance_raw_events m
     JOIN attendance_raw_events p
       ON p.device_sn = m.device_sn AND p.device_user_id = m.device_user_id
      AND p.source = 'zkteco_push'
      AND ABS(TIMESTAMPDIFF(SECOND, p.punch_at, m.punch_at)) <= 90
    WHERE m.source='manual' AND m.device_sn = ? AND m.school_id = ?`, [SN, TO_SCHOOL]);
if (overlap[0].c > 0) { console.error(`ABORT: ${overlap[0].c} manual rows now overlap push rows — discard-vs-repair decision must be revisited.`); process.exit(1); }

if (!APPLY) {
  if (idRows.length) {
    const s = idRows[0];
    console.log(`sample repair: id=${s.id} pin=${s.device_user_id} reported ${s.device_reported_time.toISOString()} → +${OFFSET_MIN}min (wall)`);
  }
  console.log('\nDry run only — re-run with --apply to execute.');
  await conn.end(); process.exit(0);
}

// ── Backups ────────────────────────────────────────────────────────────────
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const dir = path.resolve(process.cwd(), `backups/phase0-${ts}`);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'devices-row.before.json'), JSON.stringify(dev, null, 2));
fs.writeFileSync(path.join(dir, 'manual-rows.before.json'), JSON.stringify(idRows, null, 2));
fs.writeFileSync(path.join(dir, 'restore.sql'),
  `-- Rollback Phase 0 (${ts})\n` +
  `UPDATE devices SET school_id = ${FROM_SCHOOL} WHERE id = ${dev.id} AND sn = '${SN}';\n` +
  `-- Identity rollback: reported_time back to punch_at for the repaired ids\n` +
  `UPDATE attendance_raw_events SET device_reported_time = punch_at, time_confidence = NULL\n` +
  `  WHERE id IN (${idRows.map(r => r.id).join(',') || 'NULL'});\n`);
console.log(`backups written → ${dir}`);

// ── Transactional repair ───────────────────────────────────────────────────
try {
  await conn.beginTransaction();

  if (tenancyNeeded) {
    const [r1] = await conn.query(
      `UPDATE devices SET school_id = ? WHERE id = ? AND sn = ? AND school_id = ?`,
      [TO_SCHOOL, dev.id, SN, FROM_SCHOOL]);
    if (r1.affectedRows !== 1) throw new Error(`tenancy update affected ${r1.affectedRows} rows (expected 1)`);
    console.log(`✔ tenancy: devices.${dev.id} ${FROM_SCHOOL} → ${TO_SCHOOL}`);
  }

  if (idRows.length) {
    const [r2] = await conn.query(
      `UPDATE attendance_raw_events
          SET device_reported_time = DATE_ADD(punch_at, INTERVAL ? MINUTE),
              time_confidence = 'high'
        WHERE source='manual' AND device_sn = ? AND school_id = ?
          AND device_reported_time = punch_at`,
      [OFFSET_MIN, SN, TO_SCHOOL]);
    if (r2.affectedRows !== idRows.length) throw new Error(`identity repair affected ${r2.affectedRows} rows (expected ${idRows.length})`);
    console.log(`✔ identity: ${r2.affectedRows} rows — device_reported_time = punch_at + ${OFFSET_MIN}min, confidence=high`);
  }

  // ── In-transaction verification ─────────────────────────────────────────
  const [v1] = await conn.query(
    `SELECT COUNT(*) c FROM attendance_raw_events
      WHERE source='manual' AND device_sn = ? AND school_id = ? AND device_reported_time = punch_at`, [SN, TO_SCHOOL]);
  const [v2] = await conn.query(
    `SELECT COUNT(*) c FROM attendance_raw_events
      WHERE source='manual' AND device_sn = ? AND school_id = ?
        AND TIMESTAMPDIFF(MINUTE, punch_at, device_reported_time) <> ?`, [SN, TO_SCHOOL, OFFSET_MIN]);
  const [v3] = await conn.query(`SELECT school_id FROM devices WHERE id = ?`, [dev.id]);
  if (v1[0].c !== 0) throw new Error(`verification: ${v1[0].c} rows still corrupted`);
  if (v2[0].c !== 0) throw new Error(`verification: ${v2[0].c} rows have wrong wall offset`);
  if (v3[0].school_id !== TO_SCHOOL) throw new Error('verification: tenancy not applied');

  await conn.commit();
  console.log('COMMITTED. verification: 0 corrupted, all wall offsets = 180min, tenancy = 12004.');
} catch (err) {
  await conn.rollback();
  console.error('ROLLED BACK:', err.message);
  process.exit(1);
}
await conn.end();
