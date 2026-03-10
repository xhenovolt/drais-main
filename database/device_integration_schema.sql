-- ============================================================
-- DRAIS DEVICE INTEGRATION SCHEMA
-- Supports multiple attendance device vendors with clean abstraction
-- ============================================================

-- ============================================================
-- 1. DEVICES TABLE
-- Stores all attendance devices (Dahua, ZKTeco, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS devices (
  id                  INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id           INT           NOT NULL,
  device_name         VARCHAR(100)  NOT NULL,
  device_type         VARCHAR(50)   NOT NULL, -- 'dahua', 'zkteco', 'other'
  device_ip           VARCHAR(50)   NOT NULL,
  device_port         INT           NOT NULL DEFAULT 80,
  device_identifier   VARCHAR(100)  NULL,     -- Serial number or unique ID
  device_username     VARCHAR(100)  NULL,     -- For HTTP auth devices
  device_password     VARCHAR(255)  NULL,     -- For HTTP auth devices
  webhook_secret      VARCHAR(255)  NULL,     -- For webhook-based devices
  poll_interval       INT           NOT NULL DEFAULT 30, -- Seconds between polls
  status              VARCHAR(20)   NOT NULL DEFAULT 'active', -- 'active', 'inactive', 'error'
  last_poll_at        DATETIME      NULL,
  last_error          TEXT          NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_school_id (school_id),
  INDEX idx_device_type (device_type),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. DEVICE_USERS TABLE
-- Maps device numeric IDs to DRAIS student IDs
-- ============================================================
CREATE TABLE IF NOT EXISTS device_users (
  id                  INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id           INT           NOT NULL,
  device_id           INT           NOT NULL,
  device_user_id      VARCHAR(50)   NOT NULL, -- Numeric ID stored in device
  student_id          INT           NOT NULL,
  enrolled_at         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_device_user (device_id, device_user_id),
  INDEX idx_school_id (school_id),
  INDEX idx_device_id (device_id),
  INDEX idx_student_id (student_id),
  
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. ATTENDANCE TABLE (Enhanced)
-- Add device tracking columns if not exists
-- ============================================================
ALTER TABLE attendance 
  ADD COLUMN IF NOT EXISTS device_id INT NULL AFTER student_id,
  ADD COLUMN IF NOT EXISTS device_type VARCHAR(50) NULL AFTER device_id,
  ADD COLUMN IF NOT EXISTS method VARCHAR(50) NULL AFTER device_type,
  ADD COLUMN IF NOT EXISTS scan_type VARCHAR(20) NULL AFTER method,
  ADD INDEX IF NOT EXISTS idx_device_id (device_id),
  ADD INDEX IF NOT EXISTS idx_timestamp (timestamp);

-- ============================================================
-- 4. DEVICE_SYNC_LOG
-- Tracks polling/sync operations for debugging
-- ============================================================
CREATE TABLE IF NOT EXISTS device_sync_log (
  id                  INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id           INT           NOT NULL,
  device_id           INT           NOT NULL,
  sync_type           VARCHAR(20)   NOT NULL, -- 'poll', 'webhook', 'manual'
  records_fetched     INT           NOT NULL DEFAULT 0,
  records_processed   INT           NOT NULL DEFAULT 0,
  records_failed      INT           NOT NULL DEFAULT 0,
  error_message       TEXT          NULL,
  sync_started_at     DATETIME      NOT NULL,
  sync_completed_at   DATETIME      NULL,
  created_at          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_school_id (school_id),
  INDEX idx_device_id (device_id),
  INDEX idx_sync_started (sync_started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SEED DATA (OPTIONAL) — For testing with simulator
-- ============================================================

-- Example device (Dahua simulator)
-- INSERT INTO devices (school_id, device_name, device_type, device_ip, device_port, status)
-- VALUES (1, 'Dahua Simulator', 'dahua', 'localhost', 3000, 'active');

-- Example device user mappings
-- INSERT INTO device_users (school_id, device_id, device_user_id, student_id)
-- VALUES 
--   (1, 1, '101', 1),
--   (1, 1, '102', 2),
--   (1, 1, '103', 3);
