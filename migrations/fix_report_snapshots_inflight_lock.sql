-- ============================================================================
-- Fix: uk_inflight blocked re-generation because it enforced uniqueness on
-- terminal-state rows ('ready'/'failed') as well as 'generating'. Replace it
-- with a STORED generated column that is NULL outside 'generating', so
-- InnoDB's "multiple NULLs allowed in UNIQUE" semantics give us a true
-- single-flight lock without blocking multiple ready/failed rows.
-- ============================================================================
ALTER TABLE report_snapshots
  DROP INDEX uk_inflight;

ALTER TABLE report_snapshots
  ADD COLUMN inflight_lock VARCHAR(64)
    GENERATED ALWAYS AS (
      CASE WHEN status = 'generating'
           THEN CONCAT_WS('|', school_id, term_id, year_id, type)
           ELSE NULL END
    ) VIRTUAL;

ALTER TABLE report_snapshots
  ADD UNIQUE KEY uk_inflight (inflight_lock);
