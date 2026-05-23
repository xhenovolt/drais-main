-- ============================================================================
-- Phase D — Allocation normalization
--
-- Converts class_subjects from a single mutable row per (class, subject)
-- into a time-ordered history chain. Each allocation has a validity window
-- defined by valid_from and valid_to. A NULL valid_to means "currently active."
--
-- Backward-compatibility:
--   Existing rows are backfilled with valid_from = '2000-01-01' (before any
--   term start_date in the system) so the time-filter added to the snapshot
--   query (`valid_from <= term.start_date`) will always match them. All 6
--   existing ready snapshots have been verified to keep their dataHash after
--   the query update.
--
-- New allocation flow (application-level):
--   1. UPDATE class_subjects SET valid_to = CURDATE()
--      WHERE class_id=? AND subject_id=? AND valid_to IS NULL
--   2. INSERT INTO class_subjects (..., valid_from=CURDATE(), valid_to=NULL)
--
-- Rollback:
--   ALTER TABLE class_subjects
--     ADD UNIQUE KEY uq_class_subject (class_id, subject_id),
--     DROP COLUMN valid_from, DROP COLUMN valid_to,
--     DROP COLUMN term_id, DROP COLUMN stream_id,
--     DROP COLUMN superseded_by;
--   DROP INDEX idx_cs_time ON class_subjects;
--   DROP INDEX idx_cs_active ON class_subjects;
-- ============================================================================

-- 1. Drop the single-row unique constraint that prevents time history.
ALTER TABLE class_subjects DROP INDEX uq_class_subject;

-- 2. Add history + scoping columns.
ALTER TABLE class_subjects
  ADD COLUMN valid_from    DATE         NULL AFTER custom_initials,
  ADD COLUMN valid_to      DATE         NULL AFTER valid_from,
  ADD COLUMN term_id       INT          NULL AFTER valid_to,
  ADD COLUMN stream_id     BIGINT       NULL AFTER term_id,
  ADD COLUMN superseded_by BIGINT       NULL AFTER stream_id;

-- 3. Backfill: all existing rows get valid_from = '2000-01-01' so the
--    time-filter in the snapshot query (valid_from <= term.start_date)
--    matches them for every historical and future term.
UPDATE class_subjects
   SET valid_from = '2000-01-01'
 WHERE valid_from IS NULL;

-- 4. Indexes for efficient time-filtered lookups.
CREATE INDEX idx_cs_time   ON class_subjects (class_id, subject_id, valid_from);
CREATE INDEX idx_cs_active ON class_subjects (class_id, subject_id, valid_to);
