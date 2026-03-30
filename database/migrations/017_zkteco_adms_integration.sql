-- ============================================
-- ZKTECO ADMS (Push Protocol) INTEGRATION
-- Database Schema Migration #017
-- Date: March 2026
-- ============================================

-- ============================================
-- 1. ZKTeco Devices Table
-- ============================================
CREATE TABLE IF NOT EXISTS zk_devices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  serial_number VARCHAR(100) NOT NULL COMMENT 'Device SN from ADMS handshake',
  device_name VARCHAR(100) NULL,
  model VARCHAR(100) NULL COMMENT 'e.g. K40, ZK-F18',
  firmware_version VARCHAR(100) NULL,
  location VARCHAR(255) NULL COMMENT 'Physical location (e.g. Main Gate)',
  ip_address VARCHAR(45) NULL,
  status ENUM('active', 'inactive', 'offline', 'maintenance') DEFAULT 'active',
  push_version VARCHAR(20) NULL COMMENT 'ADMS push protocol version',
  last_heartbeat TIMESTAMP NULL COMMENT 'Last GET /iclock/cdata',
  last_activity TIMESTAMP NULL COMMENT 'Last POST with data',
  options TEXT NULL COMMENT 'options= param from handshake',
  registered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_serial (serial_number),
  INDEX idx_school (school_id),
  INDEX idx_status (status),
  INDEX idx_last_heartbeat (last_heartbeat)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='ZKTeco devices registered via ADMS push protocol';

-- ============================================
-- 2. ZKTeco Raw Logs (NEVER DELETE — forensic record)
-- ============================================
CREATE TABLE IF NOT EXISTS zk_raw_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_sn VARCHAR(100) NOT NULL,
  http_method VARCHAR(10) NOT NULL COMMENT 'GET or POST',
  query_string TEXT NULL,
  raw_body TEXT NULL,
  parsed_data JSON NULL,
  source_ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_device_sn (device_sn),
  INDEX idx_created (created_at),
  INDEX idx_method (http_method)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Raw ZKTeco ADMS traffic — forensic log, never delete';

-- ============================================
-- 3. ZKTeco Attendance Logs (Parsed & normalized)
-- ============================================
CREATE TABLE IF NOT EXISTS zk_attendance_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  device_sn VARCHAR(100) NOT NULL,
  device_user_id VARCHAR(100) NOT NULL COMMENT 'USERID from device',
  student_id BIGINT NULL COMMENT 'Matched student ID (null if unmatched)',
  staff_id BIGINT NULL COMMENT 'Matched staff ID (null if unmatched)',
  check_time DATETIME NOT NULL COMMENT 'CHECKTIME from device punch',
  verify_type INT NULL COMMENT '0=password, 1=fingerprint, 2=card, 15=face',
  io_mode INT NULL COMMENT '0=check-in, 1=check-out, 2=break-out, 3=break-in, 4=OT-in, 5=OT-out',
  log_id VARCHAR(50) NULL COMMENT 'LOGID from device',
  work_code VARCHAR(50) NULL COMMENT 'WORKCODE if available',
  processed TINYINT(1) DEFAULT 0 COMMENT 'Whether pushed to student_attendance',
  matched TINYINT(1) DEFAULT 0 COMMENT 'Whether USERID was matched to a student/staff',
  raw_log_id BIGINT NULL COMMENT 'FK to zk_raw_logs.id',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_device_sn (device_sn),
  INDEX idx_device_user (device_user_id),
  INDEX idx_student (student_id),
  INDEX idx_staff (staff_id),
  INDEX idx_check_time (check_time),
  INDEX idx_processed (processed),
  INDEX idx_matched (matched),
  INDEX idx_school_date (school_id, check_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Normalized ZKTeco attendance punches';

-- ============================================
-- 4. Device Command Queue (Server → Device)
-- ============================================
CREATE TABLE IF NOT EXISTS zk_device_commands (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  device_sn VARCHAR(100) NOT NULL,
  command TEXT NOT NULL COMMENT 'Full command string (DATA UPDATE USERID=1...)',
  status ENUM('pending', 'sent', 'acknowledged', 'failed', 'expired') DEFAULT 'pending',
  priority INT DEFAULT 0 COMMENT 'Higher = sent first',
  sent_at TIMESTAMP NULL COMMENT 'When command was sent to device',
  ack_at TIMESTAMP NULL COMMENT 'When device acknowledged',
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  error_message TEXT NULL,
  created_by BIGINT NULL COMMENT 'User who queued the command',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NULL COMMENT 'Auto-expire stale commands',
  
  INDEX idx_device_pending (device_sn, status, priority),
  INDEX idx_status (status),
  INDEX idx_created (created_at),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Command queue: server pushes commands to ZKTeco devices';

-- ============================================
-- 5. Device-to-User Mapping
-- ============================================
CREATE TABLE IF NOT EXISTS zk_user_mapping (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  device_user_id VARCHAR(100) NOT NULL COMMENT 'User ID on the ZKTeco device',
  user_type ENUM('student', 'staff') NOT NULL,
  student_id BIGINT NULL,
  staff_id BIGINT NULL,
  device_sn VARCHAR(100) NULL COMMENT 'NULL = global mapping across all devices',
  card_number VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_device_user (device_user_id, device_sn),
  INDEX idx_student (student_id),
  INDEX idx_staff (staff_id),
  INDEX idx_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Maps ZKTeco device user IDs to DRAIS students/staff';
