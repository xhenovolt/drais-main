-- =============================================================================
-- DRAIS Migration 021: Student Lifecycle System
-- Creates study_modes, programs, enrollment_programs, student_additional_info,
-- student_documents, parents, student_parents tables.
-- Alters enrollments to add study_mode_id.
-- =============================================================================

-- -------------------------
-- study_modes
-- -------------------------
CREATE TABLE IF NOT EXISTS study_modes (
  id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id  BIGINT       NULL COMMENT 'NULL = system default',
  name       VARCHAR(100) NOT NULL,
  is_default TINYINT(1)   NOT NULL DEFAULT 0,
  is_active  TINYINT(1)   NOT NULL DEFAULT 1,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_study_mode_school_name (school_id, name)
);

-- Seed system-wide defaults (school_id = NULL, safe with INSERT IGNORE)
INSERT IGNORE INTO study_modes (school_id, name, is_default, is_active)
VALUES
  (NULL, 'Day',      1, 1),
  (NULL, 'Boarding', 0, 1);

-- -------------------------
-- programs
-- -------------------------
CREATE TABLE IF NOT EXISTS programs (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id   BIGINT       NOT NULL,
  name        VARCHAR(150) NOT NULL,
  description TEXT         NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_program_school_name (school_id, name)
);

-- -------------------------
-- enrollment_programs (many-to-many: enrollments <-> programs)
-- -------------------------
CREATE TABLE IF NOT EXISTS enrollment_programs (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  enrollment_id BIGINT NOT NULL,
  program_id    BIGINT NOT NULL,
  UNIQUE KEY uq_enrollment_program (enrollment_id, program_id)
);

-- -------------------------
-- student_additional_info
-- -------------------------
CREATE TABLE IF NOT EXISTS student_additional_info (
  id               BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id       BIGINT       NOT NULL UNIQUE,
  orphan_status    VARCHAR(50)  NULL COMMENT 'none | single | double | unknown',
  previous_school  VARCHAR(255) NULL,
  notes            TEXT         NULL,
  created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- -------------------------
-- parents / guardians
-- -------------------------
CREATE TABLE IF NOT EXISTS parents (
  id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id  BIGINT       NOT NULL,
  name       VARCHAR(255) NOT NULL,
  phone      VARCHAR(30)  NULL,
  email      VARCHAR(255) NULL,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- student_parents (many-to-many: students <-> parents)
-- -------------------------
CREATE TABLE IF NOT EXISTS student_parents (
  id           BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id   BIGINT      NOT NULL,
  parent_id    BIGINT      NOT NULL,
  relationship VARCHAR(50) NOT NULL DEFAULT 'guardian' COMMENT 'father | mother | guardian | other',
  UNIQUE KEY uq_student_parent (student_id, parent_id)
);

-- -------------------------
-- student_documents
-- -------------------------
CREATE TABLE IF NOT EXISTS student_documents (
  id            BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id    BIGINT       NOT NULL,
  school_id     BIGINT       NOT NULL,
  document_type VARCHAR(80)  NOT NULL COMMENT 'birth_certificate | report_card | medical | photo | other',
  file_url      VARCHAR(500) NOT NULL,
  uploaded_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------
-- ALTER enrollments: add study_mode_id (idempotent guard)
-- -------------------------
SET @col_exists = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME   = 'enrollments'
    AND COLUMN_NAME  = 'study_mode_id'
);

SET @sql = IF(
  @col_exists = 0,
  'ALTER TABLE enrollments ADD COLUMN study_mode_id BIGINT NULL AFTER term_id',
  'SELECT 1 -- study_mode_id already exists, skipping'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
