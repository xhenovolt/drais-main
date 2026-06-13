-- ============================================================================
-- 020 — ATTENDANCE TRUST REFACTOR (Phase 0 + Phase 1)
-- ----------------------------------------------------------------------------
-- Run order matters. Take a backup first. Every step is reversible:
--   * dedup steps delete only exact-duplicate DERIVED rows (raw forensic
--     truth lives in zk_raw_logs, which is untouched);
--   * the biometric_enrollments OLD shape is RENAMED, never dropped;
--   * legacy mapping tables are kept fully intact.
--
-- The runtime schema-ensure modules apply the same changes lazily for
-- fresh databases; this file is for existing production databases where
-- duplicate rows block the unique keys.
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 0.1  zk_attendance_logs — dedupe, keep the OLDEST row per punch
-- ────────────────────────────────────────────────────────────────────────────
-- Preserve an audit count first (optional but recommended):
--   SELECT COUNT(*) AS dup_rows FROM zk_attendance_logs a
--   JOIN zk_attendance_logs b
--     ON a.device_sn = b.device_sn
--    AND a.device_user_id = b.device_user_id
--    AND a.check_time = b.check_time
--    AND a.id > b.id;

DELETE a FROM zk_attendance_logs a
JOIN zk_attendance_logs b
  ON a.device_sn      = b.device_sn
 AND a.device_user_id = b.device_user_id
 AND a.check_time     = b.check_time
 AND a.id > b.id;

ALTER TABLE zk_attendance_logs
  ADD UNIQUE KEY uk_punch (device_sn, device_user_id, check_time);

-- ────────────────────────────────────────────────────────────────────────────
-- 0.2  attendance_raw_events — dedupe, keep the OLDEST row per punch
-- ────────────────────────────────────────────────────────────────────────────
DELETE a FROM attendance_raw_events a
JOIN attendance_raw_events b
  ON a.school_id      = b.school_id
 AND a.device_sn      = b.device_sn
 AND a.device_user_id = b.device_user_id
 AND a.punch_at       = b.punch_at
 AND a.source         = b.source
 AND a.id > b.id;

ALTER TABLE attendance_raw_events
  ADD UNIQUE KEY uk_raw_punch (school_id, device_sn, device_user_id, punch_at, source);

-- ────────────────────────────────────────────────────────────────────────────
-- 1.1  biometric_enrollments — shape collision (handled automatically at
--      runtime by ensureBiometricEnrollmentsSchema; manual equivalent below)
-- ────────────────────────────────────────────────────────────────────────────
-- Detect: SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
--          WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='biometric_enrollments';
-- If the result has NO `pin_value` column (OLD pipeline shape), run:
--   RENAME TABLE biometric_enrollments TO biometric_enrollments_legacy;
-- Then let the app boot once (it creates the canonical table and
-- backfills resolvable legacy rows), or apply the canonical CREATE from
-- src/Database/DRAIS.sql.

-- Add the pending_capture status to pre-existing canonical installs:
ALTER TABLE biometric_enrollments
  MODIFY status ENUM('active','pending_capture','suspended','revoked','transferred')
  NOT NULL DEFAULT 'active';

-- ────────────────────────────────────────────────────────────────────────────
-- 1.2  zk_user_mapping — backfill school_id so strict school scoping holds
-- ────────────────────────────────────────────────────────────────────────────
-- (a) from the owning device, where the mapping names a registered SN:
UPDATE zk_user_mapping m
JOIN devices d ON d.sn = m.device_sn
SET m.school_id = d.school_id
WHERE (m.school_id IS NULL OR m.school_id = 0)
  AND d.school_id IS NOT NULL;

-- (b) from the mapped student:
UPDATE zk_user_mapping m
JOIN students s ON s.id = m.student_id
SET m.school_id = s.school_id
WHERE (m.school_id IS NULL OR m.school_id = 0)
  AND m.student_id IS NOT NULL;

-- (c) from the mapped staff member:
UPDATE zk_user_mapping m
JOIN staff st ON st.id = m.staff_id
SET m.school_id = st.school_id
WHERE (m.school_id IS NULL OR m.school_id = 0)
  AND m.staff_id IS NOT NULL;

-- Rows still NULL/0 after (a)-(c) cannot be safely attributed; the
-- resolver now ignores them (they surface as unmatched punches in the
-- pending reconciliation queue). List them for manual review:
--   SELECT * FROM zk_user_mapping WHERE school_id IS NULL OR school_id = 0;

-- ────────────────────────────────────────────────────────────────────────────
-- 1.3  zk_user_mapping — repair IP-as-serial rows written by the old
--      local TCP enroller (device_sn looked like an IPv4 address)
-- ────────────────────────────────────────────────────────────────────────────
-- Where exactly one ZKTeco device exists for the school, rebind to it:
UPDATE zk_user_mapping m
JOIN (
  SELECT school_id, MIN(sn) AS sn
    FROM devices
   WHERE deleted_at IS NULL AND sn IS NOT NULL
   GROUP BY school_id
  HAVING COUNT(*) = 1
) one ON one.school_id = m.school_id
SET m.device_sn = one.sn
WHERE m.device_sn REGEXP '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$';

-- Multi-device schools: review remaining IP rows manually:
--   SELECT * FROM zk_user_mapping
--    WHERE device_sn REGEXP '^[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}\\.[0-9]{1,3}$';

-- ────────────────────────────────────────────────────────────────────────────
-- 1.4  devices — canonical ADMS columns (idempotent at runtime via
--      ensureDevicesCanonicalSchema; manual equivalents)
-- ────────────────────────────────────────────────────────────────────────────
-- Only needed if the installed `devices` table is the old integration
-- shape (no `sn` column). Check first:
--   SHOW COLUMNS FROM devices LIKE 'sn';
-- ALTER TABLE devices ADD COLUMN sn VARCHAR(100) DEFAULT NULL;
-- ALTER TABLE devices ADD COLUMN ip_address VARCHAR(50) DEFAULT NULL;
-- ALTER TABLE devices ADD COLUMN options TEXT DEFAULT NULL;
-- ALTER TABLE devices ADD COLUMN push_version VARCHAR(50) DEFAULT NULL;
-- ALTER TABLE devices ADD COLUMN is_online TINYINT(1) NOT NULL DEFAULT 0;
-- ALTER TABLE devices ADD COLUMN last_seen DATETIME DEFAULT NULL;
-- ALTER TABLE devices ADD COLUMN last_activity DATETIME DEFAULT NULL;
-- ALTER TABLE devices ADD COLUMN deleted_at DATETIME DEFAULT NULL;
-- ALTER TABLE devices ADD COLUMN model_name VARCHAR(100) DEFAULT NULL;
-- ALTER TABLE devices ADD COLUMN firmware_version VARCHAR(100) DEFAULT NULL;
-- ALTER TABLE devices ADD COLUMN location VARCHAR(255) DEFAULT NULL;
-- ALTER TABLE devices ADD UNIQUE KEY uk_devices_sn (sn);

-- ────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ────────────────────────────────────────────────────────────────────────────
-- ALTER TABLE zk_attendance_logs    DROP INDEX uk_punch;
-- ALTER TABLE attendance_raw_events DROP INDEX uk_raw_punch;
-- RENAME TABLE biometric_enrollments TO biometric_enrollments_canonical_unused,
--              biometric_enrollments_legacy TO biometric_enrollments;  -- only if 1.1 ran
-- (school_id backfills are additive and safe to leave in place)
