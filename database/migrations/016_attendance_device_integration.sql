-- ============================================
-- ENHANCED ATTENDANCE DEVICE INTEGRATION
-- Database Schema Migration
-- ============================================

-- ============================================
-- 1. DEVICE LOGS TABLE (Raw Logs - Never Delete)
-- ============================================
CREATE TABLE IF NOT EXISTS device_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id BIGINT NOT NULL,
  device_type VARCHAR(50) NOT NULL DEFAULT 'dahua',
  user_identifier VARCHAR(255) NOT NULL COMMENT 'Fingerprint ID or card number',
  user_id BIGINT NULL COMMENT 'Matched student/staff ID',
  user_type ENUM('learner', 'staff', 'unknown') DEFAULT 'unknown',
  timestamp DATETIME NOT NULL COMMENT 'When the scan occurred',
  event_type ENUM('entry', 'exit', 'unknown') DEFAULT 'entry',
  method ENUM('fingerprint', 'card', 'face', 'password', 'unknown') DEFAULT 'unknown',
  raw_payload JSON NULL COMMENT 'Original JSON from device',
  synced_at TIMESTAMP NULL COMMENT 'When this log was synced to our system',
  processed TINYINT(1) DEFAULT 0 COMMENT 'Whether attendance has been processed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_device (device_id),
  INDEX idx_device_timestamp (device_id, timestamp),
  INDEX idx_user_identifier (user_identifier),
  INDEX idx_timestamp (timestamp),
  INDEX idx_processed (processed),
  INDEX idx_user_id (user_id),
  INDEX idx_synced_at (synced_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Raw biometric device logs - NEVER DELETE';

-- ============================================
-- 2. ATTENDANCE SESSIONS TABLE (Processed Attendance)
-- ============================================
CREATE TABLE IF NOT EXISTS attendance_sessions_v2 (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id BIGINT NOT NULL,
  user_type ENUM('learner', 'staff') NOT NULL,
  class_id BIGINT NULL COMMENT 'For learners',
  department_id BIGINT NULL COMMENT 'For staff',
  academic_year_id BIGINT NULL,
  term_id BIGINT NULL,
  date DATE NOT NULL,
  first_scan_time TIME NULL COMMENT 'First check-in time',
  last_scan_time TIME NULL COMMENT 'Last check-out time',
  arrival_status ENUM('present', 'late', 'absent', 'excused') DEFAULT 'absent',
  departure_status ENUM('present', 'early_leave', 'absent') DEFAULT 'present',
  status ENUM('Present', 'Late', 'Absent', 'Excused') DEFAULT 'Absent' COMMENT 'Combined status',
  source ENUM('device', 'manual', 'imported') DEFAULT 'device',
  device_id BIGINT NULL COMMENT 'Source device',
  late_reason VARCHAR(255) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_user_date (user_id, user_type, date),
  INDEX idx_user (user_id),
  INDEX idx_date (date),
  INDEX idx_user_type (user_type),
  INDEX idx_class (class_id),
  INDEX idx_status (status),
  INDEX idx_device (device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Processed attendance sessions from device logs';

-- ============================================
-- 3. DEVICE SYNC CHECKPOINTS (For incremental sync)
-- ============================================
CREATE TABLE IF NOT EXISTS device_sync_checkpoints (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id BIGINT NOT NULL,
  last_sync_timestamp DATETIME NOT NULL COMMENT 'Last successful sync time',
  last_sync_record_count INT DEFAULT 0,
  sync_status ENUM('success', 'failed', 'in_progress') DEFAULT 'success',
  sync_error TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_device (device_id),
  INDEX idx_device_status (device_id, sync_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Track sync checkpoints per device for incremental syncing';

-- ============================================
-- 4. ENHANCED DAHUA DEVICES TABLE (Add encrypted credentials)
-- ============================================
ALTER TABLE dahua_devices 
  ADD COLUMN IF NOT EXISTS encrypted_password VARCHAR(255) NULL COMMENT 'AES encrypted password',
  ADD COLUMN IF NOT EXISTS encryption_key_id VARCHAR(50) NULL COMMENT 'Reference to encryption key',
  ADD COLUMN IF NOT EXISTS poll_interval_seconds INT DEFAULT 60 COMMENT 'Poll interval in seconds',
  ADD COLUMN IF NOT EXISTS last_poll_at TIMESTAMP NULL COMMENT 'Last poll time',
  ADD COLUMN IF NOT EXISTS poll_status ENUM('idle', 'polling', 'error') DEFAULT 'idle';

-- ============================================
-- 5. ENHANCED BIOMETRIC DEVICES TABLE (Add encrypted credentials)
-- ============================================
ALTER TABLE biometric_devices 
  ADD COLUMN IF NOT EXISTS encrypted_credentials TEXT NULL COMMENT 'AES encrypted JSON credentials',
  ADD COLUMN IF NOT EXISTS encryption_key_id VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS poll_interval_seconds INT DEFAULT 60,
  ADD COLUMN IF NOT EXISTS last_poll_at TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS poll_status ENUM('idle', 'polling', 'error') DEFAULT 'idle';

-- ============================================
-- 6. DEVICE CONNECTION LOGS (Security)
-- ============================================
CREATE TABLE IF NOT EXISTS device_connection_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id BIGINT NOT NULL,
  action ENUM('test_connection', 'sync', 'connect', 'disconnect', 'config_update') NOT NULL,
  status ENUM('success', 'failed', 'timeout') NOT NULL,
  request_data JSON NULL COMMENT 'Sanitized request data',
  response_status INT NULL,
  error_message TEXT NULL,
  ip_address VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_device (device_id),
  INDEX idx_action (action),
  INDEX idx_status (status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Log all device connection attempts for security';

-- ============================================
-- 7. ATTENDANCE RULES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS attendance_rules (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  rule_name VARCHAR(100) NOT NULL,
  user_type ENUM('learner', 'staff') NOT NULL,
  day_of_week ENUM('monday','tuesday','wednesday','thursday','friday','saturday','sunday') NULL,
  start_time TIME NOT NULL COMMENT 'Expected arrival start',
  end_time TIME NOT NULL COMMENT 'Expected arrival end',
  late_threshold_minutes INT DEFAULT 15 COMMENT 'Minutes after start_time to mark late',
  absent_threshold_minutes INT DEFAULT 60 COMMENT 'Minutes after start_time to mark absent',
  departure_start TIME NULL COMMENT 'Expected departure start',
  departure_end TIME NULL COMMENT 'Expected departure end',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_school (school_id),
  INDEX idx_user_type (user_type),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Attendance rules for automatic status determination';

-- ============================================
-- 8. DEFAULT ATTENDANCE RULES
-- ============================================
INSERT INTO attendance_rules (school_id, rule_name, user_type, day_of_week, start_time, end_time, late_threshold_minutes, absent_threshold_minutes, departure_start, departure_end)
VALUES 
  (1, 'Weekday Morning - Learners', 'learner', 'monday', '07:30:00', '08:30:00', 15, 60, '14:00:00', '17:00:00'),
  (1, 'Weekday Morning - Staff', 'staff', 'monday', '08:00:00', '09:00:00', 15, 60, '16:00:00', '18:00:00'),
  (1, 'Weekday Morning - Learners', 'learner', 'tuesday', '07:30:00', '08:30:00', 15, 60, '14:00:00', '17:00:00'),
  (1, 'Weekday Morning - Staff', 'staff', 'tuesday', '08:00:00', '09:00:00', 15, 60, '16:00:00', '18:00:00'),
  (1, 'Weekday Morning - Learners', 'learner', 'wednesday', '07:30:00', '08:30:00', 15, 60, '14:00:00', '17:00:00'),
  (1, 'Weekday Morning - Staff', 'staff', 'wednesday', '08:00:00', '09:00:00', 15, 60, '16:00:00', '18:00:00'),
  (1, 'Weekday Morning - Learners', 'learner', 'thursday', '07:30:00', '08:30:00', 15, 60, '14:00:00', '17:00:00'),
  (1, 'Weekday Morning - Staff', 'staff', 'thursday', '08:00:00', '09:00:00', 15, 60, '16:00:00', '18:00:00'),
  (1, 'Weekday Morning - Learners', 'learner', 'friday', '07:30:00', '08:30:00', 15, 60, '14:00:00', '17:00:00'),
  (1, 'Weekday Morning - Staff', 'staff', 'friday', '08:00:00', '09:00:00', 15, 60, '16:00:00', '18:00:00');

-- ============================================
-- 9. ADD CARD_NO TO STUDENTS TABLE (for device matching)
-- ============================================
ALTER TABLE students ADD COLUMN IF NOT EXISTS card_no VARCHAR(100) NULL;
ALTER TABLE students ADD INDEX IF NOT EXISTS idx_card_no (card_no);

-- ============================================
-- 10. ADD CARD_NO TO STAFF TABLE (for device matching)
-- ============================================
ALTER TABLE staff ADD COLUMN IF NOT EXISTS card_no VARCHAR(100) NULL;
ALTER TABLE staff ADD INDEX IF NOT EXISTS idx_card_no (card_no);
