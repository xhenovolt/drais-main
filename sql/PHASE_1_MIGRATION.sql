-- ============================================================================
-- DRais 2.0 - Phase 1: Database Schema Migration
-- Multi-Tenancy Foundation & Device Abstraction Layer
-- ============================================================================
-- WARNING: Back up your database before running this script!
-- COMPATIBILITY: MySQL 5.7+ / MariaDB 10.2+
-- ============================================================================

SET FOREIGN_KEY_CHECKS=0;

-- ============================================================================
-- SECTION 1: CREATE CORE MULTI-TENANCY TABLES
-- ============================================================================

-- 1.1 Schools Table (Root of multi-tenancy)
CREATE TABLE IF NOT EXISTS schools (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  code VARCHAR(50) UNIQUE NOT NULL,
  domain VARCHAR(255),
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(100),
  status ENUM('active', 'inactive') DEFAULT 'active',
  created_by INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_code (code),
  INDEX idx_status (status)
);

-- 1.2 Insert Default School (if not exists)
INSERT IGNORE INTO schools (id, name, code) VALUES (1, 'Default School', 'DEFAULT_001');

-- 1.3 Biometric Devices Table
CREATE TABLE IF NOT EXISTS biometric_devices (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  device_id VARCHAR(255) NOT NULL COMMENT 'Unique identifier from manufacturer',
  device_name VARCHAR(255),
  serial_number VARCHAR(255),
  model VARCHAR(100),
  manufacturer VARCHAR(100),
  ip_address VARCHAR(45),
  status ENUM('active', 'inactive', 'offline', 'error', 'maintenance') DEFAULT 'active',
  location VARCHAR(255) COMMENT 'Physical location e.g. Gate A, Office',
  device_timezone VARCHAR(50) DEFAULT 'UTC',
  max_users INT DEFAULT 3000 COMMENT 'Device capacity',
  total_logs_fetched INT DEFAULT 0 COMMENT 'Cumulative logs',
  last_rec_no INT DEFAULT 0 COMMENT 'Last record number synced',
  last_sync_at TIMESTAMP NULL ON UPDATE CURRENT_TIMESTAMP,
  next_sync_at TIMESTAMP NULL,
  sync_failed_count INT DEFAULT 0,
  last_error VARCHAR(500),
  sync_interval_minutes INT DEFAULT 5,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  UNIQUE KEY unique_device_per_school (school_id, device_id),
  INDEX idx_status (status),
  INDEX idx_last_sync (last_sync_at)
);

-- 1.4 Device User Mappings Table (Solves biometric ID mismatches)
CREATE TABLE IF NOT EXISTS device_user_mappings (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  device_id INT NOT NULL,
  student_id INT NOT NULL,
  device_user_id INT NOT NULL COMMENT 'The actual biometric ID on the device',
  status ENUM('active', 'inactive', 'pending_sync', 'error') DEFAULT 'active',
  enrollment_status ENUM('current', 'transferred', 'graduated', 'dropped') DEFAULT 'current',
  mappings_sync_status ENUM('synced', 'pending', 'failed') DEFAULT 'pending',
  last_synced_at TIMESTAMP NULL,
  sync_attempts INT DEFAULT 0,
  last_sync_error VARCHAR(500),
  verified BOOLEAN DEFAULT FALSE COMMENT 'Verified via test punch',
  verified_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES biometric_devices(id) ON DELETE CASCADE,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
  UNIQUE KEY unique_mapping_per_device (device_id, device_user_id),
  INDEX idx_school_student (school_id, student_id),
  INDEX idx_status (status),
  INDEX idx_enrollment_status (enrollment_status)
);

-- 1.5 Unmatched Attendance Logs
CREATE TABLE IF NOT EXISTS unmatched_attendance_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  device_id INT NOT NULL,
  device_user_id INT NOT NULL,
  raw_rec_no INT COMMENT 'Record number from device',
  timestamp DATETIME NOT NULL,
  verification_method VARCHAR(50),
  event_type VARCHAR(50),
  status ENUM('unmatched', 'resolved', 'ignored', 'duplicate') DEFAULT 'unmatched',
  resolution_notes TEXT,
  resolved_student_id INT,
  resolved_by INT COMMENT 'User who resolved this',
  resolved_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES biometric_devices(id) ON DELETE CASCADE,
  FOREIGN KEY (resolved_student_id) REFERENCES students(id) ON DELETE SET NULL,
  INDEX idx_school_status (school_id, status),
  INDEX idx_timestamp (timestamp),
  INDEX idx_device_user (device_id, device_user_id)
);

-- 1.6 Activity Logs (Audit trail for compliance)
CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  actor_user_id INT COMMENT 'Who made the change',
  action VARCHAR(100) NOT NULL COMMENT 'create, update, delete, merge, etc',
  entity_type VARCHAR(50) NOT NULL COMMENT 'student, device, mapping, etc',
  entity_id INT COMMENT 'ID of the entity being changed',
  parent_entity_type VARCHAR(50),
  parent_entity_id INT,
  old_values JSON COMMENT 'Previous values',
  new_values JSON COMMENT 'New values',
  reason TEXT COMMENT 'Why the change was made',
  ip_address VARCHAR(45),
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  INDEX idx_school_action (school_id, action),
  INDEX idx_entity (entity_type, entity_id),
  INDEX idx_created (created_at),
  INDEX idx_actor (actor_user_id)
);

-- 1.7 Device Sync History (Operational visibility)
CREATE TABLE IF NOT EXISTS device_sync_history (
  id INT PRIMARY KEY AUTO_INCREMENT,
  school_id INT NOT NULL,
  device_id INT NOT NULL,
  sync_type ENUM('full', 'incremental', 'manual') DEFAULT 'incremental',
  status ENUM('success', 'partial', 'failed', 'timeout') DEFAULT 'success',
  trigger_type ENUM('scheduled', 'manual', 'alert') DEFAULT 'scheduled',
  logs_fetched INT DEFAULT 0,
  logs_processed INT DEFAULT 0,
  logs_verified INT DEFAULT 0,
  logs_unmatched INT DEFAULT 0,
  logs_skipped INT DEFAULT 0 COMMENT 'Duplicates or errors',
  from_rec_no INT,
  to_rec_no INT,
  error_message TEXT,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  duration_ms INT COMMENT 'Total sync time',
  response_time_ms INT COMMENT 'Device response time',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES biometric_devices(id) ON DELETE CASCADE,
  INDEX idx_school_device (school_id, device_id),
  INDEX idx_status (status),
  INDEX idx_created (created_at),
  INDEX idx_completed (completed_at)
);

-- ============================================================================
-- SECTION 2: ALTER EXISTING TABLES TO ADD school_id
-- ============================================================================

-- 2.1 Add school_id to students table
ALTER TABLE students 
ADD COLUMN school_id INT NOT NULL DEFAULT 1 AFTER id,
ADD FOREIGN KEY (school_id) REFERENCES schools(id),
ADD INDEX idx_school_id (school_id),
ADD INDEX idx_school_status (school_id, status);

-- 2.2 Add school_id to people table
ALTER TABLE people 
ADD COLUMN school_id INT NOT NULL DEFAULT 1 AFTER id,
ADD FOREIGN KEY (school_id) REFERENCES schools(id),
ADD INDEX idx_school_id (school_id);

-- 2.3 Add school_id to enrollments table
ALTER TABLE enrollments 
ADD COLUMN school_id INT NOT NULL DEFAULT 1 AFTER id,
ADD FOREIGN KEY (school_id) REFERENCES schools(id),
ADD INDEX idx_school_id (school_id),
ADD INDEX idx_school_student (school_id, student_id);

-- 2.4 Add school_id to attendance if it exists
ALTER TABLE attendance 
ADD COLUMN school_id INT NOT NULL DEFAULT 1 AFTER id,
ADD FOREIGN KEY (school_id) REFERENCES schools(id),
ADD INDEX idx_school_id (school_id),
ADD INDEX idx_school_student_date (school_id, student_id, date);

-- 2.5 Add device context to attendance
ALTER TABLE attendance 
ADD COLUMN device_id INT AFTER school_id,
ADD COLUMN device_user_id INT AFTER device_id,
ADD FOREIGN KEY (device_id) REFERENCES biometric_devices(id) ON DELETE SET NULL;

-- ============================================================================
-- SECTION 3: CREATE VERIFICATION QUERIES
-- ============================================================================

-- 3.1 Verify all students have school_id
SELECT COUNT(*) as students_without_school_id FROM students WHERE school_id IS NULL OR school_id = 0;

-- 3.2 Verify all people have school_id
SELECT COUNT(*) as people_without_school_id FROM people WHERE school_id IS NULL OR school_id = 0;

-- 3.3 Verify all enrollments have school_id
SELECT COUNT(*) as enrollments_without_school_id FROM enrollments WHERE school_id IS NULL OR school_id = 0;

-- 3.4 List all new tables
SHOW TABLES LIKE '%device%';
SHOW TABLES LIKE '%activity_log%';

-- ============================================================================
-- SECTION 4: CREATE HELPFUL VIEWS FOR MIGRATION
-- ============================================================================

-- View: Device Dashboard
CREATE OR REPLACE VIEW vw_device_dashboard AS
SELECT 
  s.name as school_name,
  bd.device_name,
  bd.status,
  bd.location,
  dsh.logs_fetched,
  dsh.logs_processed,
  dsh.status as last_sync_status,
  dsh.completed_at as last_sync_time
FROM biometric_devices bd
LEFT JOIN schools s ON bd.school_id = s.id
LEFT JOIN device_sync_history dsh ON bd.id = dsh.device_id
WHERE dsh.id = (SELECT MAX(id) FROM device_sync_history WHERE device_id = bd.id);

-- View: Mapping Status Summary
CREATE OR REPLACE VIEW vw_mapping_status_summary AS
SELECT 
  s.name as school_name,
  COUNT(*) as total_mappings,
  SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active,
  SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) as inactive,
  SUM(CASE WHEN status = 'pending_sync' THEN 1 ELSE 0 END) as pending,
  SUM(CASE WHEN verified = TRUE THEN 1 ELSE 0 END) as verified
FROM device_user_mappings dum
JOIN schools s ON dum.school_id = s.id
GROUP BY s.id;

-- ============================================================================
-- SECTION 5: SEED DATA FOR TESTING (OPTIONAL)
-- ============================================================================

-- Uncomment if you want to create a test device
-- INSERT INTO biometric_devices (school_id, device_id, device_name, serial_number, model, status, location) 
-- VALUES (1, 'DAHUA_001', 'Main Gate Device', 'SN123456', 'ASA1222L', 'active', 'Gate A');

-- ============================================================================
-- COMPLETION CHECK
-- ============================================================================

SELECT 
  'Schools' as table_name, COUNT(*) as row_count FROM schools
UNION ALL
SELECT 'Biometric Devices', COUNT(*) FROM biometric_devices
UNION ALL
SELECT 'Device Mappings', COUNT(*) FROM device_user_mappings
UNION ALL
SELECT 'Activity Logs', COUNT(*) FROM activity_logs
UNION ALL
SELECT 'Device Sync History', COUNT(*) FROM device_sync_history;

-- ============================================================================
-- ROLLBACK SCRIPT (Save this separately!)
-- ============================================================================
/*
DROP TABLE IF EXISTS device_sync_history;
DROP TABLE IF EXISTS activity_logs;
DROP TABLE IF EXISTS unmatched_attendance_logs;
DROP TABLE IF EXISTS device_user_mappings;
DROP TABLE IF EXISTS biometric_devices;
DROP TABLE IF EXISTS schools;

ALTER TABLE students DROP COLUMN school_id;
ALTER TABLE people DROP COLUMN school_id;
ALTER TABLE enrollments DROP COLUMN school_id;
ALTER TABLE attendance DROP COLUMN school_id, DROP COLUMN device_id, DROP COLUMN device_user_id;
*/

SET FOREIGN_KEY_CHECKS=1;
