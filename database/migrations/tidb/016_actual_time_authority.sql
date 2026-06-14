-- 016_actual_time_authority.sql
-- Separate a punch's IDENTITY (device-reported time) from its ACTUAL TIME.
--
-- Problem observed in the field: device displayed 20:00, DRAIS recorded
-- 23:00, true time was 15:00. Two stacked errors:
--   1. The device RTC was ~5h fast (20:00 vs actual 15:00).
--   2. punch_at/check_time stored the device's naive wall-clock digits;
--      mysql2 (timezone:'Z') read them back as if UTC and the browser
--      added the EAT offset (+3) → a phantom extra 3 hours (23:00).
--
-- Fix: punch_at / check_time now hold the ACTUAL instant the punch was
-- received (server time — an absolute, timezone-independent moment),
-- stored as a real UTC timestamp so the browser renders correct local
-- time. For a realtime ADMS push this equals the true punch time and no
-- longer depends on the device clock at all.
--
-- Because punch_at is now the receive instant (not unique per punch — a
-- backlog batch could share a second), dedup must key on the punch's
-- IDENTITY instead: (device_sn, device_user_id, device_reported_time) —
-- which is exactly what uk_punch used to be before this change. The
-- device-reported value is preserved for audit + dedup.

-- ── attendance_raw_events: carry the same audit columns as zk_attendance_logs
ALTER TABLE attendance_raw_events
  ADD COLUMN IF NOT EXISTS device_reported_time DATETIME NULL
    COMMENT 'Raw wall-clock the device reported (punch identity / dedup key)';
ALTER TABLE attendance_raw_events
  ADD COLUMN IF NOT EXISTS clock_skew_seconds INT NULL
    COMMENT 'device_wall - expected_wall, seconds (+ = device ahead/future)';
ALTER TABLE attendance_raw_events
  ADD COLUMN IF NOT EXISTS time_source VARCHAR(8) NOT NULL DEFAULT 'device'
    COMMENT 'server = punch_at is the server receive instant; device = device clock';

-- ── Swap dedup keys from the stored time to the device-reported identity.
-- Old keys were on check_time / punch_at, which now hold the (non-unique)
-- receive instant, so they must go. Historical rows have NULL
-- device_reported_time → treated as distinct → no migration conflict.
ALTER TABLE zk_attendance_logs DROP INDEX IF EXISTS uk_punch;
ALTER TABLE zk_attendance_logs
  ADD UNIQUE INDEX uk_punch_identity (device_sn, device_user_id, device_reported_time);

ALTER TABLE attendance_raw_events DROP INDEX IF EXISTS uk_raw_punch;
ALTER TABLE attendance_raw_events
  ADD UNIQUE INDEX uk_raw_identity (school_id, device_sn, device_user_id, device_reported_time, source);
