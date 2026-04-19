-- ============================================================
-- MIGRATION 027 — Multi-Program Enrollment Support
-- Allows one learner to belong to multiple programs/classes simultaneously
-- (e.g. Secular P5 + Theology P3 = two separate enrollment rows)
-- ============================================================
-- SAFE TO RE-RUN: all steps are idempotent

-- ─────────────────────────────────────────────────────────────
-- STEP 1: Add program_id to classes (class can belong to a program)
-- ─────────────────────────────────────────────────────────────
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'classes'
    AND COLUMN_NAME  = 'program_id'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE classes ADD COLUMN program_id BIGINT NULL COMMENT ''Primary program this class belongs to'' AFTER curriculum_id',
  'SELECT 1 -- classes.program_id already exists, skipping'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Index on classes.program_id
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'classes'
    AND INDEX_NAME   = 'idx_classes_program_id'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE classes ADD INDEX idx_classes_program_id (program_id)',
  'SELECT 1 -- index already exists'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────
-- STEP 2: Add UNIQUE constraint on enrollments (student+program+term per school)
-- This enforces: one enrollment row per student per program per term
-- NOTE: MySQL/TiDB allow multiple NULL values in a UNIQUE index,
--       so existing rows with NULL program_id are unaffected.
-- ─────────────────────────────────────────────────────────────
SET @idx_exists = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'enrollments'
    AND INDEX_NAME   = 'uq_enrollment_student_program_term'
);
SET @sql = IF(
  @idx_exists = 0,
  'ALTER TABLE enrollments ADD UNIQUE KEY uq_enrollment_student_program_term (school_id, student_id, program_id, term_id)',
  'SELECT 1 -- unique constraint already exists'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────
-- STEP 3: Ensure enrollments.program_id column exists
-- (added in migration 020/021 but verify)
-- ─────────────────────────────────────────────────────────────
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'enrollments'
    AND COLUMN_NAME  = 'program_id'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE enrollments ADD COLUMN program_id BIGINT NULL AFTER curriculum_id',
  'SELECT 1 -- enrollments.program_id already exists'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────
-- STEP 4: Backfill secular program for existing enrollments
-- Students without a program_id get assigned to the first/default program
-- (school admins can adjust via admin UI)
-- ONLY runs if there are enrollments with NULL program_id AND programs exist
-- ─────────────────────────────────────────────────────────────
-- Backfill is intentionally a no-op here — do NOT guess theology.
-- School admins assign theology enrollment manually via bulk-assign.
-- Secular backfill is handled per-school via admin panel.

-- ─────────────────────────────────────────────────────────────
-- STEP 5: Add class_results.program_id (results must be program-aware)
-- ─────────────────────────────────────────────────────────────
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'class_results'
    AND COLUMN_NAME  = 'program_id'
);
SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE class_results ADD COLUMN program_id BIGINT NULL COMMENT \'\'Program this result belongs to\'\'',
  'SELECT 1 -- class_results.program_id already exists'
);
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- ─────────────────────────────────────────────────────────────
-- VALIDATION
-- ─────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='classes'     AND COLUMN_NAME='program_id') AS classes_program_id_col,
  (SELECT COUNT(*) FROM information_schema.STATISTICS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='enrollments' AND INDEX_NAME='uq_enrollment_student_program_term') AS uq_constraint,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME='class_results' AND COLUMN_NAME='program_id') AS results_program_id_col;
