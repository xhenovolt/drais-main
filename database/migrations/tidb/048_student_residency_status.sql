-- 048 — Student residency (day scholar / boarding) classification.
--
-- attendance_rules.boarding_scope, policy-resolver.ts and rule-evaluator.ts
-- already support day/boarding-scoped attendance rules end-to-end, but
-- engine.ts has always passed personIsBoarding: undefined — there was no
-- stable per-student signal to read it from. The only existing proxy,
-- enrollments.study_mode_id -> study_modes.name, is per-ENROLLMENT (reset
-- on every re-enrollment/promotion cycle) and free-text (school-customisable
-- name), so matching on it is fragile across schools. This adds an explicit,
-- stable, per-STUDENT classification instead, per the spec's own framing:
-- residency doesn't change when a student is promoted or re-enrolled, and
-- must be settable/auditable independent of the academic enrollment record.
--
-- SAFE TO RE-RUN: every step is idempotent (guarded by an information_schema
-- existence check, matching every other migration in this directory).
--
-- Default 'day' for every existing and new student is a deliberate,
-- conservative choice: as of this migration, every school's attendance_rules
-- rows use boarding_scope='all' (verified against production), so this is a
-- pure no-op for current behaviour. A boarding_scope='boarding'/'day' rule
-- only starts actually excluding the wrong population once a school admin
-- explicitly reclassifies specific students as boarding via the new
-- students/residency API — nobody is silently reclassified by this
-- migration itself.

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'residency_status'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE students ADD COLUMN residency_status ENUM(''day'',''boarding'') NOT NULL DEFAULT ''day'' AFTER status',
  'SELECT 1 -- students.residency_status already exists'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'residency_status_updated_at'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE students ADD COLUMN residency_status_updated_at TIMESTAMP NULL DEFAULT NULL',
  'SELECT 1 -- students.residency_status_updated_at already exists'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND COLUMN_NAME = 'residency_status_updated_by'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE students ADD COLUMN residency_status_updated_by BIGINT NULL DEFAULT NULL',
  'SELECT 1 -- students.residency_status_updated_by already exists'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index: attendance recalculation and bulk-classification screens filter by
-- (school_id, residency_status) — students already has a school_id column.
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'students' AND INDEX_NAME = 'idx_students_school_residency'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE students ADD INDEX idx_students_school_residency (school_id, residency_status)',
  'SELECT 1 -- index already exists'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- VALIDATION
SELECT
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='students' AND COLUMN_NAME='residency_status') AS residency_status_col,
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='students' AND INDEX_NAME='idx_students_school_residency') AS idx_present;
