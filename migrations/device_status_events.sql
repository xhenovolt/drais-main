-- Device uptime history (additive only — no existing table or column is changed).
--
-- device_status_events : APPEND-ONLY. One row per transition of a device between online and offline.
--                        Derived from contact (device_heartbeats GETs + zk_raw_logs data pushes) by
--                        src/lib/devices/uptime.ts; a device is offline once it has not been heard from
--                        for the configured threshold (platform_settings 'device_offline_threshold_minutes',
--                        default 5). `at` for an offline event = last contact + threshold.
-- device_status_state  : one row per device — the processing cursor (last contact seen) and the
--                        current derived status. Mutable bookkeeping; the history lives in the events.
-- The runtime creates both with CREATE TABLE IF NOT EXISTS (ensureDeviceUptimeSchema); this file is
-- the same DDL for manual / fresh installs.

CREATE TABLE IF NOT EXISTS device_status_events (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  device_sn   VARCHAR(100) NOT NULL,
  school_id   BIGINT NULL,
  status      VARCHAR(10)  NOT NULL,            -- 'online' | 'offline'
  at          DATETIME     NOT NULL,            -- when the device entered this status (UTC)
  source      VARCHAR(32)  NOT NULL,            -- 'heartbeat' | 'push' | 'threshold' | 'backfill'
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_dse_sn_at (device_sn, at),
  KEY idx_dse_school_at (school_id, at)
);

CREATE TABLE IF NOT EXISTS device_status_state (
  device_sn        VARCHAR(100) NOT NULL PRIMARY KEY,
  status           VARCHAR(10)  NOT NULL,       -- current derived status
  since            DATETIME     NOT NULL,       -- when it entered the current status
  last_contact_at  DATETIME     NULL,           -- newest contact processed (the cursor)
  updated_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
