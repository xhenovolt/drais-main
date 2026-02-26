-- ============================================
-- DAHUA BIOMETRIC DEVICE INTEGRATION
-- Database Schema Migration
-- ============================================

-- Table to store Dahua device API configurations
CREATE TABLE IF NOT EXISTS dahua_devices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  device_name VARCHAR(100) NOT NULL,
  device_code VARCHAR(50) UNIQUE,
  ip_address VARCHAR(45) NOT NULL,
  port INT DEFAULT 80,
  api_url VARCHAR(255) NOT NULL,
  username VARCHAR(100),
  password VARCHAR(255),
  device_type ENUM('attendance', 'access_control', 'hybrid') DEFAULT 'attendance',
  protocol ENUM('http', 'https') DEFAULT 'http',
  status ENUM('active', 'inactive', 'offline', 'error') DEFAULT 'active',
  last_sync TIMESTAMP NULL,
  last_sync_status ENUM('success', 'failed', 'pending') DEFAULT 'pending',
  last_error_message TEXT,
  auto_sync_enabled TINYINT(1) DEFAULT 1,
  sync_interval_minutes INT DEFAULT 15,
  late_threshold_minutes INT DEFAULT 30,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_dahua_code (device_code),
  INDEX idx_school (school_id),
  INDEX idx_status (status),
  INDEX idx_ip (ip_address)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Dahua biometric device configuration and settings';

-- Table to store raw Dahua attendance logs before processing
CREATE TABLE IF NOT EXISTS dahua_raw_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id BIGINT NOT NULL,
  raw_data TEXT NOT NULL,
  record_count INT DEFAULT 0,
  parsed_successfully TINYINT(1) DEFAULT 0,
  parse_errors TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_device (device_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Raw Dahua device logs storage';

-- Table to store normalized attendance logs from Dahua devices
CREATE TABLE IF NOT EXISTS dahua_attendance_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id BIGINT NOT NULL,
  student_id BIGINT,
  card_no VARCHAR(100),
  user_id VARCHAR(100),
  event_time DATETIME NOT NULL,
  event_type ENUM('Entry', 'Exit', 'Unknown') DEFAULT 'Entry',
  method ENUM('fingerprint', 'card', 'face', 'password', 'unknown') DEFAULT 'unknown',
  status ENUM('present', 'absent', 'late', 'processed') DEFAULT 'processed',
  raw_log_id BIGINT,
  matched_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_device (device_id),
  INDEX idx_student (student_id),
  INDEX idx_card (card_no),
  INDEX idx_event_time (event_time),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Normalized Dahua attendance logs';

-- Table to store Dahua device sync history
CREATE TABLE IF NOT EXISTS dahua_sync_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_id BIGINT NOT NULL,
  sync_type ENUM('manual', 'scheduled', 'automatic') DEFAULT 'manual',
  records_fetched INT DEFAULT 0,
  records_processed INT DEFAULT 0,
  records_failed INT DEFAULT 0,
  status ENUM('in_progress', 'success', 'failed', 'partial') DEFAULT 'in_progress',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  error_details TEXT,
  
  INDEX idx_device (device_id),
  INDEX idx_started (started_at),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Dahua device sync history tracking';

-- Add CardNo field to students table if not exists
-- This is used to match Dahua device records to students
-- ALTER TABLE students ADD COLUMN IF NOT EXISTS card_no VARCHAR(100) NULL;
-- ALTER TABLE students ADD INDEX idx_card_no (card_no);

-- Insert sample Dahua device for testing
INSERT INTO dahua_devices (school_id, device_name, device_code, ip_address, port, api_url, username, password, device_type, status) 
VALUES (1, 'Main Gate Scanner', 'DAHUA-001', '192.168.1.100', 80, '/cgi-bin/attendanceRecord.cgi?action=getRecords', 'admin', 'admin123', 'attendance', 'active')
ON DUPLICATE KEY UPDATE device_name = VALUES(device_name);

-- Insert sample device for testing if no devices exist
INSERT INTO dahua_devices (school_id, device_name, device_code, ip_address, port, api_url, device_type, status)
SELECT 1, 'Main Gate Attendance', 'DAHUA-MAIN-001', '192.168.1.100', 80, '/cgi-bin/recordCard.cgi?action=getRecords', 'attendance', 'active'
WHERE NOT EXISTS (SELECT 1 FROM dahua_devices WHERE device_code = 'DAHUA-MAIN-001');
