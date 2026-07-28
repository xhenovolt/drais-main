-- Bound how far "behind" real time a device clock may read before
-- CORRECT_BY_DRIFT's correctOfflineBacklog trust stops applying automatically.
-- Fixes an asymmetric-trust bug: only future/ahead readings were ever
-- distrusted; a device reading arbitrarily far BEHIND was always trusted as
-- "offline backlog" regardless of magnitude. A live incident showed the same
-- device, in one short ingest batch, producing both a plausible few-hours-
-- behind reading and one behind by ~14 hours — the clock is unstable, not
-- genuinely offline. Default 8h (28800s) covers an overnight-closed school
-- without a device restart; beyond that the punch is flagged 'review'
-- instead of silently trusted, mirroring how an implausible future timestamp
-- already gets flagged.

ALTER TABLE attendance_time_policy
  ADD COLUMN IF NOT EXISTS max_offline_backlog_seconds INT NOT NULL DEFAULT 28800
    COMMENT 'Cap on how far behind real time a device clock may read and still be trusted as offline backlog; beyond this, flag for review instead of silently trusting.';
