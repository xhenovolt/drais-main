-- ============================================================
-- DRAIS: Academic Type Migration
-- Adds academic_type (secular | theology) to subjects and
-- class_results, enabling a modular dual-academic engine.
--
-- Safe to run multiple times (all statements use IF NOT EXISTS
-- or guard against duplicate columns via meta check).
-- ============================================================

-- ── 1. SUBJECTS TABLE ──────────────────────────────────────
-- Add academic_type column if missing
ALTER TABLE subjects
  ADD COLUMN IF NOT EXISTS academic_type ENUM('secular','theology') NOT NULL DEFAULT 'secular'
  AFTER subject_type;

-- Index for fast lookups
ALTER TABLE subjects
  ADD INDEX IF NOT EXISTS idx_subjects_academic_type (school_id, academic_type);

-- ── 2. CLASS_RESULTS TABLE ─────────────────────────────────
-- Add academic_type column if missing
ALTER TABLE class_results
  ADD COLUMN IF NOT EXISTS academic_type ENUM('secular','theology') NOT NULL DEFAULT 'secular';

-- Index for list queries filtered by academic_type
ALTER TABLE class_results
  ADD INDEX IF NOT EXISTS idx_cr_academic_type (academic_type);

-- ── 3. MIGRATE EXISTING DATA (Phase 8) ─────────────────────
-- All existing records are assumed secular
UPDATE subjects
  SET academic_type = 'secular'
  WHERE academic_type IS NULL OR academic_type = '';

UPDATE class_results
  SET academic_type = 'secular'
  WHERE academic_type IS NULL OR academic_type = '';

-- ── 4. OPTIONAL: academic_programs REFERENCE TABLE ─────────
-- Future-proof: named academic streams per school
CREATE TABLE IF NOT EXISTS academic_programs (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id   BIGINT       NOT NULL,
  name        VARCHAR(80)  NOT NULL,
  slug        VARCHAR(40)  NOT NULL,   -- 'secular', 'theology', 'cambridge', 'ib', etc.
  description TEXT         DEFAULT NULL,
  is_active   TINYINT(1)   NOT NULL DEFAULT 1,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_school_slug (school_id, slug),
  INDEX idx_school_active (school_id, is_active)
);

-- Seed default programs (safe — INSERT IGNORE won't duplicate)
INSERT IGNORE INTO academic_programs (school_id, name, slug)
SELECT DISTINCT school_id, 'Secular',  'secular'  FROM subjects;

INSERT IGNORE INTO academic_programs (school_id, name, slug)
SELECT DISTINCT school_id, 'Theology', 'theology' FROM subjects
WHERE 1=0; -- theology programs are created on-demand per school
