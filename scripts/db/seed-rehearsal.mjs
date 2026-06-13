#!/usr/bin/env node
/**
 * Phase 2D — rehearsal database seeder.
 *
 * Creates a scratch database ON THE SAME TiDB cluster (identical
 * engine semantics — better than a local MySQL rehearsal) and seeds it
 * with fixtures that exercise every risky migration path:
 *
 *   - OLD-shape biometric_enrollments (002 must rename + backfill)
 *   - zk_attendance_logs with exact-duplicate punches (005 must dedupe
 *     keeping the oldest id, then add uk_punch)
 *   - zk_user_mapping rows with NULL school_id and an IP-as-serial row
 *     (006 must backfill/repair)
 *   - minimal students/staff/people/devices so the backfills can join
 *
 *   node --env-file=.env.local scripts/db/seed-rehearsal.mjs [dbname]
 *
 * The scratch database is safe to drop afterwards:
 *   DROP DATABASE <dbname>;
 */
import mysql from 'mysql2/promise';

const DB_NAME = process.argv[2] || 'drais_phase2_rehearsal';
if (!/^[a-z0-9_]+$/i.test(DB_NAME) || DB_NAME === 'drais') {
  console.error('refusing: rehearsal db name must be a simple identifier and not the production db');
  process.exit(2);
}

const cfg = {
  host: process.env.TIDB_HOST,
  port: parseInt(process.env.TIDB_PORT || '4000', 10),
  user: process.env.TIDB_USER,
  password: process.env.TIDB_PASSWORD,
  ssl: { rejectUnauthorized: false },
};

const main = async () => {
  const conn = await mysql.createConnection(cfg);
  const q = async (sql, p = []) => (await conn.query(sql, p))[0];

  await q(`CREATE DATABASE IF NOT EXISTS ${DB_NAME}`);
  await q(`USE ${DB_NAME}`);
  console.log('rehearsal database:', DB_NAME);

  // Minimal supporting tables
  await q(`CREATE TABLE IF NOT EXISTS people (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, school_id BIGINT,
    first_name VARCHAR(100), last_name VARCHAR(100),
    deleted_at DATETIME NULL)`);
  await q(`CREATE TABLE IF NOT EXISTS students (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, school_id BIGINT NOT NULL,
    person_id BIGINT NOT NULL, status VARCHAR(20) DEFAULT 'active',
    deleted_at DATETIME NULL)`);
  await q(`CREATE TABLE IF NOT EXISTS staff (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, school_id BIGINT NOT NULL,
    person_id BIGINT NOT NULL, status VARCHAR(20) DEFAULT 'active',
    deleted_at DATETIME NULL)`);
  await q(`CREATE TABLE IF NOT EXISTS devices (
    id BIGINT PRIMARY KEY AUTO_INCREMENT, school_id BIGINT,
    sn VARCHAR(100), ip_address VARCHAR(50), status VARCHAR(20) DEFAULT 'active',
    is_online TINYINT(1) DEFAULT 0, last_seen DATETIME NULL, deleted_at DATETIME NULL,
    UNIQUE KEY uk_sn (sn))`);

  // OLD-shape biometric_enrollments (the production collision)
  await q(`CREATE TABLE IF NOT EXISTS biometric_enrollments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    device_sn VARCHAR(64) NOT NULL,
    device_slot INT UNSIGNED NOT NULL,
    student_id BIGINT NULL,
    status ENUM('INITIATED','CAPTURED','UNASSIGNED','ASSIGNED','VERIFIED','ORPHANED') NOT NULL DEFAULT 'INITIATED',
    source VARCHAR(20) NULL, session_id BIGINT NULL, finger_index INT NULL,
    assigned_at DATETIME NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_device_slot (device_sn, device_slot))`);

  await q(`CREATE TABLE IF NOT EXISTS zk_user_mapping (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL DEFAULT 1,
    device_user_id VARCHAR(100) NOT NULL,
    user_type ENUM('student','staff') NOT NULL,
    student_id BIGINT NULL, staff_id BIGINT NULL,
    device_sn VARCHAR(100) NULL, card_number VARCHAR(100) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_device_user (device_user_id, device_sn))`);

  await q(`CREATE TABLE IF NOT EXISTS zk_attendance_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL DEFAULT 1,
    device_sn VARCHAR(100) NOT NULL,
    device_user_id VARCHAR(100) NOT NULL,
    student_id BIGINT NULL, staff_id BIGINT NULL,
    check_time DATETIME NOT NULL,
    verify_type INT NULL, io_mode INT NULL,
    log_id VARCHAR(50) NULL, work_code VARCHAR(50) NULL,
    processed TINYINT(1) DEFAULT 0, matched TINYINT(1) DEFAULT 0,
    raw_log_id BIGINT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`);

  // ── Fixtures ─────────────────────────────────────────────────────────
  await q(`INSERT INTO people (id, school_id, first_name, last_name) VALUES
    (1, 1, 'AISHA', 'NAKATO'), (2, 1, 'JOHN', 'OKELLO'), (3, 1, 'GRACE', 'ACHENG'),
    (4, 2, 'PETER', 'WANYAMA')
    ON DUPLICATE KEY UPDATE first_name = VALUES(first_name)`);
  await q(`INSERT INTO students (id, school_id, person_id) VALUES
    (101, 1, 1), (102, 1, 2), (201, 2, 4)
    ON DUPLICATE KEY UPDATE person_id = VALUES(person_id)`);
  await q(`INSERT INTO staff (id, school_id, person_id) VALUES (501, 1, 3)
    ON DUPLICATE KEY UPDATE person_id = VALUES(person_id)`);
  await q(`INSERT INTO devices (id, school_id, sn, ip_address) VALUES
    (1, 1, 'REHEARSAL-K40-A', '192.168.1.201'),
    (2, 2, 'REHEARSAL-K40-B', '192.168.5.50')
    ON DUPLICATE KEY UPDATE ip_address = VALUES(ip_address)`);

  // OLD-shape enrollment that 002 must migrate (student 101, PIN 7)
  await q(`INSERT IGNORE INTO biometric_enrollments
    (school_id, device_sn, device_slot, student_id, status, source)
    VALUES (1, 'REHEARSAL-K40-A', 7, 101, 'ASSIGNED', 'local')`);
  // …and one that must be SKIPPED (no student)
  await q(`INSERT IGNORE INTO biometric_enrollments
    (school_id, device_sn, device_slot, student_id, status)
    VALUES (1, 'REHEARSAL-K40-A', 8, NULL, 'ORPHANED')`);

  // Mappings: NULL-school row (006 must backfill from student),
  // IP-as-serial row (006 must repair — school 2 has exactly 1 device),
  // staff mapping (002 must backfill as staff).
  await q(`INSERT IGNORE INTO zk_user_mapping
    (school_id, device_user_id, user_type, student_id, device_sn) VALUES
    (0, '12', 'student', 102, 'REHEARSAL-K40-A')`);
  await q(`INSERT IGNORE INTO zk_user_mapping
    (school_id, device_user_id, user_type, student_id, device_sn) VALUES
    (2, '3', 'student', 201, '192.168.5.50')`);
  await q(`INSERT IGNORE INTO zk_user_mapping
    (school_id, device_user_id, user_type, staff_id, device_sn) VALUES
    (1, '40', 'staff', 501, 'REHEARSAL-K40-A')`);

  // Duplicate punches: same (sn, pin, check_time) three times (005
  // must keep the oldest id) + one distinct punch.
  await q(`INSERT INTO zk_attendance_logs
    (school_id, device_sn, device_user_id, student_id, check_time, matched) VALUES
    (1, 'REHEARSAL-K40-A', '7', 101, '2026-06-10 07:55:00', 1),
    (1, 'REHEARSAL-K40-A', '7', 101, '2026-06-10 07:55:00', 1),
    (1, 'REHEARSAL-K40-A', '7', 101, '2026-06-10 07:55:00', 1),
    (1, 'REHEARSAL-K40-A', '7', 101, '2026-06-10 16:45:00', 1)`);

  const counts = {};
  for (const t of ['people', 'students', 'staff', 'devices', 'biometric_enrollments', 'zk_user_mapping', 'zk_attendance_logs']) {
    counts[t] = (await q(`SELECT COUNT(*) n FROM ${t}`))[0].n;
  }
  console.log('seeded:', JSON.stringify(counts));
  console.log(`\nnext: node --env-file=.env.local scripts/db/migrate.mjs --database ${DB_NAME}`);
  await conn.end();
};
main().catch((e) => { console.error('seed failed:', e.message); process.exit(1); });
