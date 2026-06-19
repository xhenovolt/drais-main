-- 018_device_time_policy.sql
-- Per-school device time policy. Replaces the single global
-- SCHOOL_UTC_OFFSET_MINUTES env + the unconditional auto-sync of device
-- clocks with explicit, school-aware configuration.
--
-- Why: time correction was global (one offset for every school) and DRAIS
-- auto-changed any device whose clock drifted >2min with no opt-out. This
-- made behaviour inconsistent across schools/devices and surprised admins
-- ("DRAIS changed my machine's time").

CREATE TABLE IF NOT EXISTS attendance_time_policy (
  school_id            BIGINT      NOT NULL PRIMARY KEY,
  school_timezone      VARCHAR(64) NOT NULL DEFAULT 'Africa/Kampala',
  utc_offset_minutes   INT         NOT NULL DEFAULT 180,   -- EAT (+3h); authority for parsing device wall-clock
  -- TRUST_DEVICE_TIME | TRUST_SERVER_RECEIVE_TIME | CORRECT_BY_DRIFT | MANUAL_REVIEW_IF_DRIFT
  device_time_policy   VARCHAR(32) NOT NULL DEFAULT 'CORRECT_BY_DRIFT',
  auto_sync_device_time TINYINT(1) NOT NULL DEFAULT 0,     -- OFF by default: DRAIS will NOT change device clocks unless opted in
  max_allowed_drift_seconds INT    NOT NULL DEFAULT 120,
  correct_offline_backlog TINYINT(1) NOT NULL DEFAULT 1,   -- trust device timestamps for backlog uploads
  display_raw_and_corrected_time TINYINT(1) NOT NULL DEFAULT 0,
  created_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Per-school device time correction policy';

-- Per-device timezone override (optional). NULL = use the school policy
-- offset. Lets a school with a device in another zone override just that one.
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS tz_offset_minutes INT NULL
    COMMENT 'Per-device UTC offset override (minutes); NULL = use school policy';

-- Confidence + which policy produced the stored punch_at, for audit/UI.
ALTER TABLE zk_attendance_logs
  ADD COLUMN IF NOT EXISTS time_confidence VARCHAR(16) NULL
    COMMENT 'high | corrected | review | server — how much to trust punch_at';
ALTER TABLE attendance_raw_events
  ADD COLUMN IF NOT EXISTS time_confidence VARCHAR(16) NULL
    COMMENT 'high | corrected | review | server';
