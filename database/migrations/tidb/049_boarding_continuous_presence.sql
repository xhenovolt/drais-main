-- 049 — Boarding continuous-presence policy (DRAIS Phase 4).
--
-- Lets a school choose, per boarding-scoped attendance rule, between:
--   'daily'      (default) — unchanged: a boarding student needs a
--                 biometric punch like anyone else.
--   'continuous' — a boarding student who is checked in (boarding_presence
--                 table) remains policy-recognized present on subsequent
--                 school days with no new punch, until checked out or put
--                 on leave, or (if a validity window is configured) until
--                 that many days pass with no fresh evidence.
--
-- SAFE TO RE-RUN: every step is idempotent.
--
-- Default 'daily' for every existing rule is a pure no-op for current
-- behaviour: continuous presence only activates once a school explicitly
-- switches a rule to it via the attendance settings UI.

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_rules' AND COLUMN_NAME = 'boarding_presence_mode'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE attendance_rules ADD COLUMN boarding_presence_mode ENUM(''daily'',''continuous'') NOT NULL DEFAULT ''daily''',
  'SELECT 1 -- attendance_rules.boarding_presence_mode already exists'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_rules' AND COLUMN_NAME = 'boarding_presence_validity_days'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE attendance_rules ADD COLUMN boarding_presence_validity_days INT NULL DEFAULT NULL',
  'SELECT 1 -- attendance_rules.boarding_presence_validity_days already exists'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- attendance_records: distinguish a policy-derived verdict (no biometric
-- evidence that day, inferred from boarding-presence policy) from a
-- normal, punch-backed one. Mirrors the existing is_provisional /
-- provisional_reason pair (same shape, different concept — provisional is
-- about UNRESOLVED identity, this is about ABSENT evidence).
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_records' AND COLUMN_NAME = 'is_policy_derived'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE attendance_records ADD COLUMN is_policy_derived BOOLEAN NOT NULL DEFAULT FALSE',
  'SELECT 1 -- attendance_records.is_policy_derived already exists'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'attendance_records' AND COLUMN_NAME = 'policy_derived_reason'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE attendance_records ADD COLUMN policy_derived_reason VARCHAR(60) NULL DEFAULT NULL',
  'SELECT 1 -- attendance_records.policy_derived_reason already exists'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- boarding_presence: current check-in/leave STATE per student (one row
-- per student, like students.status — full history lives in audit_logs
-- via logAudit() on every transition, not duplicated here as a second
-- event table).
CREATE TABLE IF NOT EXISTS boarding_presence (
  id                   BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id            BIGINT NOT NULL,
  student_id           BIGINT NOT NULL,
  person_id            BIGINT NOT NULL,
  status               ENUM('checked_in','on_leave') NOT NULL DEFAULT 'checked_in',
  since_date           DATE NOT NULL,
  expected_return_date DATE NULL DEFAULT NULL,
  reason               VARCHAR(255) NULL DEFAULT NULL,
  recorded_by          BIGINT NULL DEFAULT NULL,
  source               ENUM('manual','biometric') NOT NULL DEFAULT 'manual',
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_boarding_presence_student (school_id, student_id),
  KEY idx_boarding_presence_person (person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- VALIDATION
SELECT
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='attendance_rules' AND COLUMN_NAME='boarding_presence_mode') AS mode_col,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='attendance_records' AND COLUMN_NAME='is_policy_derived') AS policy_col,
  (SELECT COUNT(*) FROM information_schema.tables
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='boarding_presence') AS table_present;
