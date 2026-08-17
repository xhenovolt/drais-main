-- ============================================================================
-- Readiness audit, Phase 2 — school_id indexes.
-- student_ledger and people were confirmed (against a real production dump)
-- to have no index leading with school_id, while 224 other indexes across
-- the schema do lead with it — this is an omission, not a design choice.
-- Both tables are small (student_ledger ~16.6k rows, people ~7.1k rows as
-- measured 2026-08-18), so this is a low-risk, non-locking addition on TiDB.
-- ============================================================================

ALTER TABLE student_ledger ADD INDEX idx_sl_school (school_id);
ALTER TABLE people         ADD INDEX idx_people_school (school_id);
