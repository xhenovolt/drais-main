-- ============================================
-- DRAIS V1: COMPLETE SYSTEM AUDIT FIX
-- Date: March 8, 2026
-- Purpose: Fix all missing tables, columns, and schema issues
-- Multi-Tenant: ALL tables include school_id for isolation
-- ============================================

USE drais;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- PART 1: VERIFY CRITICAL TABLES EXIST
-- ============================================

-- 1. Terms table - check if status column exists
SELECT COUNT(*) INTO @column_exists FROM INFORMATION_SCHEMA.COLUMNS 
WHERE table_schema = DATABASE() 
  AND table_name = 'terms' 
  AND column_name = 'status';

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE terms ADD COLUMN status ENUM(''scheduled'', ''active'', ''completed'', ''cancelled'') DEFAULT ''scheduled'' AFTER end_date',
    'SELECT ''Terms status column already exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add is_active column if missing (for legacy queries)
SELECT COUNT(*) INTO @column_exists FROM INFORMATION_SCHEMA.COLUMNS 
WHERE table_schema = DATABASE() 
  AND table_name = 'terms' 
  AND column_name = 'is_active';

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE terms ADD COLUMN is_active TINYINT(1) DEFAULT 1 AFTER status',
    'SELECT ''Terms is_active column already exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. Device User Mappings table - CRITICAL for biometric attendance
CREATE TABLE IF NOT EXISTS device_user_mappings (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  device_id BIGINT NOT NULL,
  student_id BIGINT DEFAULT NULL,
  staff_id BIGINT DEFAULT NULL,
  device_user_id INT NOT NULL COMMENT 'Device enrolled user ID (biometric ID)',
  status ENUM('active','inactive','suspended') DEFAULT 'active',
  enrollment_status ENUM('enrolled','pending','failed') DEFAULT 'enrolled',
  verified TINYINT(1) DEFAULT 0,
  mappings_sync_status ENUM('pending','synced','failed') DEFAULT 'pending',
  last_synced_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  
  UNIQUE KEY uk_school_device_user (school_id, device_user_id),
  UNIQUE KEY uk_device_student (device_id, student_id),
  UNIQUE KEY uk_device_staff (device_id, staff_id),
  KEY idx_school_id (school_id),
  KEY idx_device_id (device_id),
  KEY idx_student_id (student_id),
  KEY idx_staff_id (staff_id),
  KEY idx_device_user_id (device_user_id),
  KEY idx_status (status),
  KEY idx_school_device (school_id, device_id),
  KEY idx_school_student (school_id, student_id),
  KEY idx_school_staff (school_id, staff_id),
  
  CONSTRAINT CHECK (student_id IS NOT NULL OR staff_id IS NOT NULL),
  CONSTRAINT CHECK (NOT (student_id IS NOT NULL AND staff_id IS NOT NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Maps biometric device user IDs to students and staff';

-- 3. Student Attendance table - verify structure
CREATE TABLE IF NOT EXISTS student_attendance (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  date DATE NOT NULL,
  status ENUM('present', 'absent', 'late', 'excused', 'not_marked') DEFAULT 'not_marked',
  attendance_session_id BIGINT DEFAULT NULL,
  class_id BIGINT DEFAULT NULL,
  term_id BIGINT DEFAULT NULL,
  academic_year_id BIGINT DEFAULT NULL,
  method ENUM('manual', 'biometric', 'card', 'qr_code', 'auto') DEFAULT 'manual',
  device_id BIGINT DEFAULT NULL,
  check_in_time TIME DEFAULT NULL,
  check_out_time TIME DEFAULT NULL,
  duration_minutes INT DEFAULT NULL,
  marked_by BIGINT DEFAULT NULL COMMENT 'User ID who marked attendance',
  remarks TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE KEY uk_student_date_session (student_id, date, attendance_session_id),
  KEY idx_school_id (school_id),
  KEY idx_date (date),
  KEY idx_student_id (student_id),
  KEY idx_class_id (class_id),
  KEY idx_term_id (term_id),
  KEY idx_status (status),
  KEY idx_school_date (school_id, date),
  KEY idx_student_date (student_id, date),
  KEY idx_date_class (date, class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Daily student attendance records';

-- 4. Attendance Sessions table
CREATE TABLE IF NOT EXISTS attendance_sessions (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  class_id BIGINT DEFAULT NULL,
  subject_id BIGINT DEFAULT NULL,
  teacher_id BIGINT DEFAULT NULL,
  session_date DATE NOT NULL,
  session_time TIME DEFAULT NULL,
  status ENUM('scheduled', 'in_progress', 'completed', 'cancelled') DEFAULT 'scheduled',
  term_id BIGINT DEFAULT NULL,
  academic_year_id BIGINT DEFAULT NULL,
  total_students INT DEFAULT 0,
  present_count INT DEFAULT 0,
  absent_count INT DEFAULT 0,
  late_count INT DEFAULT 0,
  remarks TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  KEY idx_school_id (school_id),
  KEY idx_class_id (class_id),
  KEY idx_session_date (session_date),
  KEY idx_status (status),
  KEY idx_school_date (school_id, session_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Attendance session tracking';

-- 5. Biometric Devices table
CREATE TABLE IF NOT EXISTS biometric_devices (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  device_name VARCHAR(255) NOT NULL,
  device_type ENUM('fingerprint', 'face', 'card', 'hybrid') DEFAULT 'fingerprint',
  manufacturer VARCHAR(100) DEFAULT NULL,
  model VARCHAR(100) DEFAULT NULL,
  serial_number VARCHAR(100) UNIQUE DEFAULT NULL,
  ip_address VARCHAR(45) DEFAULT NULL,
  port INT DEFAULT 4370,
  location VARCHAR(255) DEFAULT NULL COMMENT 'Physical location of device',
  status ENUM('active', 'inactive', 'maintenance', 'error') DEFAULT 'active',
  firmware_version VARCHAR(50) DEFAULT NULL,
  capacity INT DEFAULT 1000 COMMENT 'Maximum user capacity',
  current_users INT DEFAULT 0,
  last_sync_at TIMESTAMP NULL DEFAULT NULL,
  sync_status ENUM('synced', 'pending', 'failed') DEFAULT 'pending',
  connection_type ENUM('tcp', 'udp', 'wifi', 'ethernet') DEFAULT 'tcp',
  api_key VARCHAR(255) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  
  KEY idx_school_id (school_id),
  KEY idx_status (status),
  KEY idx_device_type (device_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Biometric device registry';

-- ============================================
-- PART 2: ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================

-- Add school_id to tables missing it (for multi-tenancy)
SET @tables_to_check = 'academic_years,terms,curriculums,classes,subjects,streams,result_types';

-- Academic years - ensure status column exists
SELECT COUNT(*) INTO @column_exists FROM INFORMATION_SCHEMA.COLUMNS 
WHERE table_schema = DATABASE() 
  AND table_name = 'academic_years' 
  AND column_name = 'status';

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE academic_years ADD COLUMN status ENUM(''active'', ''completed'', ''archived'') DEFAULT ''active'' AFTER end_date',
    'SELECT ''Academic years status column already exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add is_current to academic_years
SELECT COUNT(*) INTO @column_exists FROM INFORMATION_SCHEMA.COLUMNS 
WHERE table_schema = DATABASE() 
  AND table_name = 'academic_years' 
  AND column_name = 'is_current';

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE academic_years ADD COLUMN is_current TINYINT(1) DEFAULT 0 AFTER status',
    'SELECT ''Academic years is_current column already exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Ensure student_contacts has proper indexes
ALTER TABLE student_contacts ADD INDEX IF NOT EXISTS idx_school_student (school_id, student_id);
ALTER TABLE student_contacts ADD INDEX IF NOT EXISTS idx_student_id (student_id);

-- ============================================
-- PART 3: ADD PERFORMANCE INDEXES
-- ============================================

-- Critical indexes for dashboard queries
ALTER TABLE students ADD INDEX IF NOT EXISTS idx_school_status (school_id, status);
ALTER TABLE students ADD INDEX IF NOT EXISTS idx_school_admission (school_id, admission_date);
ALTER TABLE class_results ADD INDEX IF NOT EXISTS idx_school_student (school_id, student_id);
ALTER TABLE class_results ADD INDEX IF NOT EXISTS idx_student_score (student_id, score);

-- Attendance performance indexes
ALTER TABLE student_attendance ADD INDEX IF NOT EXISTS idx_school_date_status (school_id, date, status);
ALTER TABLE device_user_mappings ADD INDEX IF NOT EXISTS idx_school_status (school_id, status);

-- ============================================
-- PART 4: UPDATE DASHBOARD QUERY COMPATIBILITY
-- ============================================

-- Add term_number to terms if missing (for compatibility)
SELECT COUNT(*) INTO @column_exists FROM INFORMATION_SCHEMA.COLUMNS 
WHERE table_schema = DATABASE() 
  AND table_name = 'terms' 
  AND column_name = 'term_number';

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE terms ADD COLUMN term_number INT DEFAULT 1 COMMENT ''1, 2, or 3'' AFTER name',
    'SELECT ''Terms term_number column already exists''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- PART 5: NOTIFICATIONS AND FEATURE FLAGS
-- ============================================

-- User notifications table
CREATE TABLE IF NOT EXISTS user_notifications (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('info', 'success', 'warning', 'error', 'system') DEFAULT 'info',
  priority ENUM('low', 'normal', 'high', 'urgent') DEFAULT 'normal',
  is_read TINYINT(1) DEFAULT 0,
  read_at TIMESTAMP NULL DEFAULT NULL,
  action_url VARCHAR(255) DEFAULT NULL,
  action_label VARCHAR(100) DEFAULT NULL,
  expires_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  KEY idx_user_id (user_id),
  KEY idx_school_id (school_id),
  KEY idx_is_read (is_read),
  KEY idx_user_unread (user_id, is_read),
  KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='User notifications';

-- Feature flags table
CREATE TABLE IF NOT EXISTS feature_flags (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  route_name VARCHAR(100) NOT NULL UNIQUE,
  route_path VARCHAR(255) NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  is_new TINYINT(1) DEFAULT 0,
  is_beta TINYINT(1) DEFAULT 0,
  is_enabled TINYINT(1) DEFAULT 1,
  version_tag VARCHAR(50) DEFAULT NULL,
  category ENUM('core', 'academics', 'finance', 'attendance', 'communication', 'reports', 'settings', 'other') DEFAULT 'other',
  priority INT DEFAULT 0,
  date_added DATE DEFAULT NULL,
  expires_at DATE DEFAULT NULL,
  min_role_level INT DEFAULT 0 COMMENT 'Minimum role level required',
  allowed_roles TEXT DEFAULT NULL COMMENT 'JSON array of allowed role slugs',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  KEY idx_route_name (route_name),
  KEY idx_is_enabled (is_enabled),
  KEY idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='Feature flags and route management';

-- ============================================
-- PART 6: DATA INTEGRITY CONSTRAINTS
-- ============================================

-- Add foreign key constraints (if not exists)
-- Note: TiDB may have limitations on foreign keys, using IF NOT EXISTS equivalent

SET @fk_check = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
                 WHERE TABLE_SCHEMA = DATABASE() 
                 AND TABLE_NAME = 'device_user_mappings' 
                 AND CONSTRAINT_NAME = 'fk_dum_school');

SET @sql = IF(@fk_check = 0,
    'ALTER TABLE device_user_mappings ADD CONSTRAINT fk_dum_school FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE',
    'SELECT ''FK already exists: device_user_mappings -> schools''');
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================
-- PART 7: DEFAULT DATA FOR TESTING
-- ============================================

-- Insert default term if none exist
INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, status, is_active)
SELECT 1, 1, 'Term 1', CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 MONTH), 'active', 1
WHERE NOT EXISTS (SELECT 1 FROM terms WHERE school_id = 1 LIMIT 1);

-- Ensure academic year exists
INSERT INTO academic_years (school_id, name, start_date, end_date, status, is_current)
SELECT 1, CONCAT('Academic Year ', YEAR(CURDATE())), 
       CONCAT(YEAR(CURDATE()), '-01-01'), 
       CONCAT(YEAR(CURDATE()), '-12-31'),
       'active', 1
WHERE NOT EXISTS (SELECT 1 FROM academic_years WHERE school_id = 1 AND is_current = 1);

-- ============================================
-- PART 8: VERIFICATION QUERIES
-- ============================================

SELECT 'Migration Complete - Verification:' as Status;
SELECT 'Terms table' as TABLE_NAME, COUNT(*) as RECORD_COUNT FROM terms;
SELECT 'Device Mappings' as TABLE_NAME, COUNT(*) as RECORD_COUNT FROM device_user_mappings;
SELECT 'Student Attendance' as TABLE_NAME, COUNT(*) as RECORD_COUNT FROM student_attendance;
SELECT 'Biometric Devices' as TABLE_NAME, COUNT(*) as RECORD_COUNT FROM biometric_devices;
SELECT 'User Notifications' as TABLE_NAME, COUNT(*) as RECORD_COUNT FROM user_notifications;
SELECT 'Feature Flags' as TABLE_NAME, COUNT(*) as RECORD_COUNT FROM feature_flags;

SET FOREIGN_KEY_CHECKS = 1;

-- End of migration
