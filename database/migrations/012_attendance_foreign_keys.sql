-- ============================================
-- DRAIS ATTENDANCE MODULE - FOREIGN KEYS ONLY
-- Purpose: Add foreign key constraints
-- Date: February 2026
-- ============================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================
-- Add Foreign Keys (Safe Constraints)
-- ============================================

-- Foreign keys for attendance_sessions
ALTER TABLE attendance_sessions 
ADD FOREIGN KEY fk_attendance_sessions_school 
  (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE attendance_sessions 
ADD FOREIGN KEY fk_attendance_sessions_class 
  (class_id) REFERENCES classes(id) ON DELETE CASCADE;

ALTER TABLE attendance_sessions 
ADD FOREIGN KEY fk_attendance_sessions_stream 
  (stream_id) REFERENCES streams(id) ON DELETE SET NULL;

-- NOTE: Skipping academic_year_id FK due to index issues - can be added later

-- Foreign keys for biometric_devices
ALTER TABLE biometric_devices 
ADD FOREIGN KEY fk_biometric_school 
  (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- Foreign keys for student_fingerprints
ALTER TABLE student_fingerprints 
ADD FOREIGN KEY fk_fingerprints_school 
  (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE student_fingerprints 
ADD FOREIGN KEY fk_fingerprints_student 
  (student_id) REFERENCES students(id) ON DELETE CASCADE;

ALTER TABLE student_fingerprints 
ADD FOREIGN KEY fk_fingerprints_device 
  (device_id) REFERENCES biometric_devices(id) ON DELETE SET NULL;

-- Foreign keys for device_sync_logs
ALTER TABLE device_sync_logs 
ADD FOREIGN KEY fk_sync_logs_school 
  (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE device_sync_logs 
ADD FOREIGN KEY fk_sync_logs_device 
  (device_id) REFERENCES biometric_devices(id) ON DELETE CASCADE;

-- Foreign keys for attendance_reconciliation
ALTER TABLE attendance_reconciliation 
ADD FOREIGN KEY fk_reconciliation_school 
  (school_id) REFERENCES schools(id) ON DELETE CASCADE;

ALTER TABLE attendance_reconciliation 
ADD FOREIGN KEY fk_reconciliation_session 
  (attendance_session_id) REFERENCES attendance_sessions(id) ON DELETE SET NULL;

ALTER TABLE attendance_reconciliation 
ADD FOREIGN KEY fk_reconciliation_student 
  (student_id) REFERENCES students(id) ON DELETE CASCADE;

-- Foreign keys for attendance_reports
ALTER TABLE attendance_reports 
ADD FOREIGN KEY fk_reports_school 
  (school_id) REFERENCES schools(id) ON DELETE CASCADE;

-- Add remaining indexes
ALTER TABLE student_attendance 
ADD INDEX idx_stream (stream_id),
ADD INDEX idx_teacher (teacher_id);

-- ============================================
-- Verify All Tables and Columns
-- ============================================

SELECT CONCAT('✓ Attendance Tables Status:') as status;
SELECT TABLE_NAME, TABLE_ROWS FROM INFORMATION_SCHEMA.TABLES 
WHERE TABLE_SCHEMA='drais_school' AND TABLE_NAME IN (
  'attendance_sessions',
  'biometric_devices',
  'student_fingerprints',
  'device_sync_logs',
  'attendance_reconciliation',
  'attendance_reports',
  'student_attendance'
)
ORDER BY TABLE_NAME;

-- Verify student_attendance columns
SELECT CONCAT('✓ student_attendance New Columns:') as status;
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_KEY 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME='student_attendance' 
AND TABLE_SCHEMA='drais_school' 
AND COLUMN_NAME IN (
  'attendance_session_id', 'term_id', 'academic_year_id', 'stream_id', 
  'subject_id', 'teacher_id', 'device_id', 'biometric_timestamp', 
  'confidence_score', 'override_reason', 'is_locked', 'locked_at'
)
ORDER BY ORDINAL_POSITION;

-- ============================================
-- Enable Foreign Keys
-- ============================================

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================
-- SUCCESS
-- ============================================
SELECT '✓ ATTENDANCE MODULE MIGRATION COMPLETE' as status;
SELECT NOW() as completion_time;
