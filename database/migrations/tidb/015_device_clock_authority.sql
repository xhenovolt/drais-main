-- 015_device_clock_authority.sql
-- Layer B (server-side time authority) audit columns.
--
-- The K40 was found ~8h fast (clock running ahead). A punch timestamped
-- in the FUTURE relative to server time is physically impossible, so the
-- ingest path now overrides punch_at with server time when the device
-- clock is ahead beyond tolerance. We keep the device-reported value and
-- the measured skew for forensic audit, and record which clock was
-- authoritative for each punch.

ALTER TABLE zk_attendance_logs
  ADD COLUMN IF NOT EXISTS device_reported_time DATETIME NULL
    COMMENT 'Raw wall-clock the device reported, before any correction';

ALTER TABLE zk_attendance_logs
  ADD COLUMN IF NOT EXISTS clock_skew_seconds INT NULL
    COMMENT 'device_wall - expected_wall, in seconds (+ = device ahead/future)';

ALTER TABLE zk_attendance_logs
  ADD COLUMN IF NOT EXISTS time_source VARCHAR(8) NOT NULL DEFAULT 'device'
    COMMENT 'device = device clock trusted; server = overridden with server time';

-- Track the device's persistent clock offset + last resync so we throttle
-- the SET OPTIONS DateTime command instead of re-queuing on every punch.
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS clock_offset_seconds INT NULL
    COMMENT 'Last measured device-clock offset (+ = device ahead of real time)';

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS clock_last_synced_at DATETIME NULL
    COMMENT 'When a time-sync command was last queued for this device';
