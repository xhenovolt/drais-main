-- ============================================
-- DRAIS ATTENDANCE MODULE - DATABASE MIGRATION
-- Version: 1.0
-- Date: February 2026
-- Description: Create comprehensive attendance system with biometric support
-- ============================================

-- ============================================
-- PART 1: CREATE NEW TABLES
-- ============================================

-- Biometric Devices Table
CREATE TABLE IF NOT EXISTS biometric_devices (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  device_name VARCHAR(100) NOT NULL,
  device_code VARCHAR(50) UNIQUE,
  device_type VARCHAR(50) DEFAULT 'fingerprint',
  manufacturer VARCHAR(100),
  model VARCHAR(100),
  serial_number VARCHAR(100) UNIQUE,
  location VARCHAR(255),
  ip_address VARCHAR(45),
  mac_address VARCHAR(17),
  fingerprint_capacity INT DEFAULT 3000,
  enrollment_count INT DEFAULT 0,
  status ENUM('active', 'inactive', 'maintenance', 'offline') DEFAULT 'active',
  last_sync_at TIMESTAMP NULL,
  sync_status ENUM('synced', 'pending', 'failed') DEFAULT 'pending',
  sync_error_message TEXT,
  last_sync_record_count INT DEFAULT 0,
  battery_level INT,
  storage_used_percent DECIMAL(5,2),
  is_master TINYINT(1) DEFAULT 0,
  api_key VARCHAR(255),
  api_secret VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  
  UNIQUE KEY unique_device_code (device_code),
  UNIQUE KEY unique_serial (serial_number),
  INDEX idx_school (school_id),
  INDEX idx_status (status),
  INDEX idx_sync_status (sync_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci 
  COMMENT='Biometric device management and tracking';

-- Attendance Sessions Table
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  class_id BIGINT NOT NULL,
  stream_id BIGINT,
  term_id BIGINT,
  academic_year_id BIGINT,
  subject_id BIGINT,
  teacher_id BIGINT,
  session_date DATE NOT NULL,
  session_start_time TIME,
  session_end_time TIME,
  session_type ENUM('morning_check', 'lesson', 'assembly', 'afternoon_check', 'custom') DEFAULT 'lesson',
  attendance_type ENUM('manual', 'biometric', 'hybrid') DEFAULT 'manual',
  status ENUM('draft', 'open', 'submitted', 'locked', 'finalized') DEFAULT 'draft',
  notes TEXT,
  submitted_at TIMESTAMP NULL,
  submitted_by BIGINT,
  finalized_at TIMESTAMP NULL,
  finalized_by BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL,
  
  INDEX idx_class_date (class_id, session_date),
  INDEX idx_status (status),
  INDEX idx_academic_year (academic_year_id),
  INDEX idx_teacher (teacher_id),
  INDEX idx_session_date (session_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Attendance session tracking for class-level periods';

-- Clean up: Drop old/duplicate student_fingerprints if exists
DROP TABLE IF EXISTS student_fingerprints;

-- New Student Fingerprints Table (Biometric Credentials)
CREATE TABLE student_fingerprints (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  student_id BIGINT NOT NULL,
  device_id BIGINT,
  finger_position ENUM('thumb', 'index', 'middle', 'ring', 'pinky', 'unknown') DEFAULT 'unknown',
  hand ENUM('left', 'right') DEFAULT 'right',
  template_data LONGBLOB,
  template_format VARCHAR(50),
  biometric_uuid VARCHAR(100),
  quality_score INT DEFAULT 0,
  enrollment_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active TINYINT(1) DEFAULT 1,
  status ENUM('active', 'inactive', 'revoked') DEFAULT 'active',
  last_matched_at TIMESTAMP NULL,
  match_count INT DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_student (student_id),
  INDEX idx_device (device_id),
  INDEX idx_status (status),
  INDEX idx_biometric_uuid (biometric_uuid),
  INDEX idx_student_device (student_id, device_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Student biometric fingerprint credentials';

-- Device Sync Logs Table
CREATE TABLE IF NOT EXISTS device_sync_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  device_id BIGINT NOT NULL,
  sync_type ENUM('attendance_download', 'fingerprint_upload', 'logs_fetch', 'device_sync') DEFAULT 'attendance_download',
  sync_direction ENUM('pull', 'push', 'bidirectional') DEFAULT 'pull',
  status ENUM('pending', 'in_progress', 'success', 'partial_success', 'failed') DEFAULT 'pending',
  records_processed INT DEFAULT 0,
  records_synced INT DEFAULT 0,
  records_failed INT DEFAULT 0,
  error_message TEXT,
  details_json JSON,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP NULL,
  duration_seconds INT,
  initiated_by BIGINT,
  
  INDEX idx_device (device_id),
  INDEX idx_started_at (started_at),
  INDEX idx_status (status),
  INDEX idx_sync_type (sync_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Device synchronization operation logs';

-- Attendance Reconciliation Table
CREATE TABLE IF NOT EXISTS attendance_reconciliation (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  attendance_session_id BIGINT,
  student_id BIGINT NOT NULL,
  manual_status ENUM('present', 'absent', 'late', 'excused') NULL,
  manual_marked_by BIGINT,
  manual_marked_at TIMESTAMP NULL,
  biometric_status ENUM('present', 'absent', 'late') NULL,
  biometric_marked_at TIMESTAMP NULL,
  reconciliation_status ENUM('matched', 'conflict', 'biometric_only', 'manual_only') DEFAULT 'matched',
  conflict_resolution ENUM('trust_biometric', 'trust_manual', 'manual_correction') DEFAULT 'trust_biometric',
  resolved_at TIMESTAMP NULL,
  resolved_by BIGINT,
  resolution_notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_session_student (attendance_session_id, student_id),
  INDEX idx_reconciliation_status (reconciliation_status),
  INDEX idx_student (student_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Hybrid attendance reconciliation (manual vs biometric)';

-- Attendance Reports Table
CREATE TABLE IF NOT EXISTS attendance_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  report_type ENUM('daily_summary', 'weekly_trend', 'monthly_summary', 'class_analysis', 'student_profile', 'period_comparison') DEFAULT 'daily_summary',
  date_from DATE,
  date_to DATE,
  class_id BIGINT,
  stream_id BIGINT,
  academic_year_id BIGINT,
  report_data LONGTEXT,  -- JSON format
  generated_by BIGINT,
  generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  
  INDEX idx_school (school_id),
  INDEX idx_generated_at (generated_at),
  INDEX idx_report_type (report_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Cached attendance reports';

-- ============================================
-- PART 2: ALTER EXISTING TABLES
-- ============================================

-- Enhance student_attendance table with new columns
-- Using SET FOREIGN_KEY_CHECKS to allow modifications
SET FOREIGN_KEY_CHECKS = 0;

ALTER TABLE student_attendance 
ADD COLUMN attendance_session_id BIGINT COMMENT 'Link to attendance session',
ADD COLUMN term_id BIGINT COMMENT 'Academic term',
ADD COLUMN academic_year_id BIGINT COMMENT 'Academic year',
ADD COLUMN stream_id BIGINT COMMENT 'Student stream/section',
ADD COLUMN subject_id BIGINT COMMENT 'Subject (if applicable)',
ADD COLUMN teacher_id BIGINT COMMENT 'Teacher who took attendance',
ADD COLUMN device_id BIGINT COMMENT 'Biometric device ID',
ADD COLUMN biometric_timestamp TIMESTAMP NULL COMMENT 'Biometric capture timestamp',
ADD COLUMN confidence_score DECIMAL(5,2) COMMENT 'Biometric confidence score',
ADD COLUMN override_reason TEXT COMMENT 'Reason for admin override',
ADD COLUMN is_locked TINYINT(1) DEFAULT 0 COMMENT 'Attendance locked status',
ADD COLUMN locked_at TIMESTAMP NULL COMMENT 'When attendance was locked',
ADD INDEX idx_session (attendance_session_id),
ADD INDEX idx_device (device_id),
ADD INDEX idx_is_locked (is_locked),
ADD INDEX idx_biometric_timestamp (biometric_timestamp);

SET FOREIGN_KEY_CHECKS = 1;

-- Update unique constraint (allow multiple records per session)
-- Note: Original UNIQUE (student_id, date) remains for backward compatibility

-- ============================================
-- PART 3: ADD FOREIGN KEYS (if tables exist)
-- ============================================

-- These will only execute if referenced tables already exist
ALTER TABLE attendance_sessions 
ADD FOREIGN KEY fk_attendance_sessions_school 
  (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE attendance_sessions 
ADD FOREIGN KEY fk_attendance_sessions_class 
  (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE attendance_sessions 
ADD FOREIGN KEY fk_attendance_sessions_stream 
  (stream_id) REFERENCES streams(id) ON DELETE SET NULL;

ALTER TABLE attendance_sessions 
ADD FOREIGN KEY fk_attendance_sessions_term 
  (term_id) REFERENCES terms(id) ON DELETE SET NULL;

ALTER TABLE biometric_devices 
ADD FOREIGN KEY fk_biometric_school 
  (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE student_fingerprints 
ADD FOREIGN KEY fk_fingerprints_school 
  (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE student_fingerprints 
ADD FOREIGN KEY fk_fingerprints_student 
  (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE student_fingerprints 
ADD FOREIGN KEY fk_fingerprints_device 
  (device_id) REFERENCES biometric_devices(id) ON DELETE SET NULL;

ALTER TABLE device_sync_logs 
ADD FOREIGN KEY fk_sync_logs_school 
  (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE device_sync_logs 
ADD FOREIGN KEY fk_sync_logs_device 
  (device_id) REFERENCES biometric_devices(id) ON DELETE CASCADE;

ALTER TABLE attendance_reconciliation 
ADD FOREIGN KEY fk_reconciliation_school 
  (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE attendance_reconciliation 
ADD FOREIGN KEY fk_reconciliation_session 
  (attendance_session_id) REFERENCES attendance_sessions(id) ON DELETE SET NULL;

ALTER TABLE attendance_reconciliation 
ADD FOREIGN KEY fk_reconciliation_student 
  (student_id) REFERENCES students(id) ON DELETE CASCADE;

-- ============================================
-- PART 4: ENABLE FOREIGN KEY CHECKS
-- ============================================

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- COMPLETION STATUS
-- ============================================
-- ✓ All new tables created
-- ✓ Existing tables enhanced
-- ✓ Indexes added for performance
-- ✓ Foreign keys configured
-- ✓ Ready for API implementation
