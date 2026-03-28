-- ============================================================================
-- JETON Internal Control Layer — Schema Extension
-- Safe to run multiple times (uses ADD IF NOT EXISTS)
--
-- NOTE: schools.status already exists as ENUM('active','inactive','suspended')
--       in the canonical schema. Only external_id is being added here.
-- ============================================================================

-- Phase 1: Add external_id to schools table
ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS external_id VARCHAR(255) NULL DEFAULT NULL
    COMMENT 'JETON external system identifier — globally unique UUID per school';

-- Unique index (TiDB / MySQL both support this ADD INDEX form)
ALTER TABLE schools
  ADD UNIQUE INDEX IF NOT EXISTS uq_schools_external_id (external_id);

-- Phase 2: Backfill — assign UUID to every school that does not yet have one
--           (TiDB supports UUID() natively)
UPDATE schools
SET external_id = UUID()
WHERE external_id IS NULL;

-- Verify
SELECT id, name, external_id, status FROM schools ORDER BY id LIMIT 20;
