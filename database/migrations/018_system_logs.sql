-- ============================================
-- SYSTEM LOGS TABLE
-- Migration #018 — Persistent System Event Log
-- Replaces manual Vercel log checking
-- Date: April 2026
-- ============================================

CREATE TABLE IF NOT EXISTS system_logs (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_sn   VARCHAR(100)  NULL COMMENT 'Device serial number (NULL for system events)',
  event_type  ENUM('HEARTBEAT','PUNCH','COMMAND_SENT','COMMAND_ACK','USERINFO','ERROR','SYSTEM')
              NOT NULL DEFAULT 'SYSTEM',
  direction   ENUM('INCOMING','OUTGOING') NOT NULL DEFAULT 'INCOMING',
  raw_data    TEXT          NULL COMMENT 'Raw payload or structured event data',
  ip_address  VARCHAR(45)   NULL,
  user_agent  VARCHAR(255)  NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_event_type (event_type),
  INDEX idx_device_sn  (device_sn),
  INDEX idx_created    (created_at),
  INDEX idx_type_date  (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Persistent system event log — replaces Vercel log checking';

-- ============================================
-- Auto-cleanup event: delete HEARTBEAT logs older than 7 days
-- Punches, commands, errors kept forever
-- ============================================
-- Note: TiDB may not support CREATE EVENT. Run this cleanup
-- via a scheduled API call or cron instead:
--
--   DELETE FROM system_logs
--   WHERE event_type = 'HEARTBEAT' AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY);
--
-- A cleanup endpoint is provided at /api/attendance/system-logs (DELETE method).
