-- ============================================
-- DRAIS ATTENDANCE MODULE - FIX MIGRATION
-- Purpose: Complete remaining attendance module setup
-- Date: February 2026
-- ============================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- STEP 1: Verify/Fix Primary Keys
-- ============================================

-- Primary keys should already exist on all referenced tables
-- Schools, classes, streams, and academic_years should all have id as PK

-- ============================================
-- STEP 2: Enhance student_attendance Table
-- ============================================

-- Add all new columns in one operation
ALTER TABLE student_attendance 
ADD COLUMN attendance_session_id BIGINT DEFAULT NULL COMMENT 'Link to attendance session' AFTER id,
ADD COLUMN term_id BIGINT DEFAULT NULL COMMENT 'Academic term' AFTER attendance_session_id,
ADD COLUMN academic_year_id BIGINT DEFAULT NULL COMMENT 'Academic year' AFTER term_id,
ADD COLUMN stream_id BIGINT DEFAULT NULL COMMENT 'Student stream/section' AFTER academic_year_id,
ADD COLUMN subject_id BIGINT DEFAULT NULL COMMENT 'Subject (if applicable)' AFTER stream_id,
ADD COLUMN teacher_id BIGINT DEFAULT NULL COMMENT 'Teacher who took attendance' AFTER subject_id,
ADD COLUMN device_id BIGINT DEFAULT NULL COMMENT 'Biometric device ID' AFTER teacher_id,
ADD COLUMN biometric_timestamp TIMESTAMP NULL DEFAULT NULL COMMENT 'Biometric capture timestamp' AFTER device_id,
ADD COLUMN confidence_score DECIMAL(5,2) DEFAULT NULL COMMENT 'Biometric confidence score' AFTER biometric_timestamp,
ADD COLUMN override_reason TEXT DEFAULT NULL COMMENT 'Reason for admin override' AFTER confidence_score,
ADD COLUMN is_locked TINYINT(1) DEFAULT 0 COMMENT 'Attendance locked status' AFTER override_reason,
ADD COLUMN locked_at TIMESTAMP NULL DEFAULT NULL COMMENT 'When attendance was locked' AFTER is_locked;

-- Add indexes for performance
ALTER TABLE student_attendance 
ADD INDEX IF NOT EXISTS idx_session (attendance_session_id),
ADD INDEX IF NOT EXISTS idx_device (device_id),
ADD INDEX IF NOT EXISTS idx_is_locked (is_locked),
ADD INDEX IF NOT EXISTS idx_biometric_timestamp (biometric_timestamp),
ADD INDEX IF NOT EXISTS idx_stream (stream_id),
ADD INDEX IF NOT EXISTS idx_teacher (teacher_id);

-- ============================================
-- STEP 3: Add Foreign Keys (Only Safe Ones)
-- ============================================

-- Foreign keys for attendance_sessions
ALTER TABLE attendance_sessions 
ADD CONSTRAINT IF NOT EXISTS fk_attendance_sessions_school 
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE attendance_sessions 
ADD CONSTRAINT IF NOT EXISTS fk_attendance_sessions_class 
  FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE attendance_sessions 
ADD CONSTRAINT IF NOT EXISTS fk_attendance_sessions_stream 
  FOREIGN KEY (stream_id) REFERENCES streams(id) ON DELETE SET NULL;

ALTER TABLE attendance_sessions 
ADD CONSTRAINT IF NOT EXISTS fk_attendance_sessions_academic_year 
  FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL;

-- Foreign keys for biometric_devices
ALTER TABLE biometric_devices 
ADD CONSTRAINT IF NOT EXISTS fk_biometric_school 
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- Foreign keys for student_fingerprints
ALTER TABLE student_fingerprints 
ADD CONSTRAINT IF NOT EXISTS fk_fingerprints_school 
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE student_fingerprints 
ADD CONSTRAINT IF NOT EXISTS fk_fingerprints_student 
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE student_fingerprints 
ADD CONSTRAINT IF NOT EXISTS fk_fingerprints_device 
  FOREIGN KEY (device_id) REFERENCES biometric_devices(id) ON DELETE SET NULL;

-- Foreign keys for device_sync_logs
ALTER TABLE device_sync_logs 
ADD CONSTRAINT IF NOT EXISTS fk_sync_logs_school 
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE device_sync_logs 
ADD CONSTRAINT IF NOT EXISTS fk_sync_logs_device 
  FOREIGN KEY (device_id) REFERENCES biometric_devices(id) ON DELETE CASCADE;

-- Foreign keys for attendance_reconciliation
ALTER TABLE attendance_reconciliation 
ADD CONSTRAINT IF NOT EXISTS fk_reconciliation_school 
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE attendance_reconciliation 
ADD CONSTRAINT IF NOT EXISTS fk_reconciliation_session 
  FOREIGN KEY (attendance_session_id) REFERENCES attendance_sessions(id) ON DELETE SET NULL;

ALTER TABLE attendance_reconciliation 
ADD CONSTRAINT IF NOT EXISTS fk_reconciliation_student 
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE;

-- Foreign keys for attendance_reports
ALTER TABLE attendance_reports 
ADD CONSTRAINT IF NOT EXISTS fk_reports_school 
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- ============================================
-- STEP 4: Verify Tables Created
-- ============================================

-- Run checks to ensure everything is in place
SELECT 'Tables Created' as status;
SELECT 'attendance_sessions' as table_name, COUNT(*) as row_count FROM attendance_sessions UNION
SELECT 'biometric_devices', COUNT(*) FROM biometric_devices UNION
SELECT 'student_fingerprints', COUNT(*) FROM student_fingerprints UNION
SELECT 'device_sync_logs', COUNT(*) FROM device_sync_logs UNION
SELECT 'attendance_reconciliation', COUNT(*) FROM attendance_reconciliation UNION
SELECT 'attendance_reports', COUNT(*) FROM attendance_reports;

-- Verify new columns exist in student_attendance
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME='student_attendance' 
AND TABLE_SCHEMA='drais_school' 
AND COLUMN_NAME IN ('attendance_session_id', 'term_id', 'academic_year_id', 'stream_id', 'subject_id', 'teacher_id', 'device_id', 'biometric_timestamp', 'confidence_score', 'override_reason', 'is_locked', 'locked_at')
ORDER BY ORDINAL_POSITION;

-- ============================================
-- STEP 5: Enable Foreign Keys
-- ============================================

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- COMPLETION
-- ============================================
SELECT '✓ Attendance Module Migration Complete' as status;
