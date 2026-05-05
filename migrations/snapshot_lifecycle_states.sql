-- ============================================================================
-- Expand report_snapshots.status to support the full lifecycle:
--   generating  → row currently locked by acquireGenerationSlot
--   ready       → terminal: payload available
--   failed      → terminal: error captured
--   cancelled   → terminal: explicitly cancelled by a user (force regen, etc.)
--   stale       → terminal: in-flight row that exceeded STALE_TIMEOUT_MS and
--                 was reaped by the stale-sweeper
--
-- TiDB cannot MODIFY a column that a generated column depends on, so we drop
-- the unique index + generated column, expand the ENUM, then recreate them.
-- inflight_lock is non-NULL only when status='generating', so terminal-state
-- values continue to coexist freely under uk_inflight (multiple NULLs allowed
-- in InnoDB UNIQUE indexes).
-- ============================================================================

ALTER TABLE report_snapshots DROP INDEX uk_inflight;
ALTER TABLE report_snapshots DROP COLUMN inflight_lock;

ALTER TABLE report_snapshots
  MODIFY COLUMN status ENUM('generating','ready','failed','cancelled','stale')
    NOT NULL DEFAULT 'generating';

ALTER TABLE report_snapshots
  ADD COLUMN inflight_lock VARCHAR(64)
    GENERATED ALWAYS AS (
      CASE WHEN status = 'generating'
           THEN CONCAT_WS('|', school_id, term_id, year_id, type)
           ELSE NULL END
    ) VIRTUAL;

ALTER TABLE report_snapshots
  ADD UNIQUE KEY uk_inflight (inflight_lock);
