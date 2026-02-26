-- DRACE Attendance Management System - Integration with drais_school
-- Add attendance feature tables to existing drais_school database
-- Date: February 20, 2026

-- ============================================================================
-- 1. Biometric Device Management Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS `biometric_devices` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `school_id` BIGINT NOT NULL,
    `device_id` VARCHAR(100) NOT NULL UNIQUE,
    `device_name` VARCHAR(100),
    `device_model` VARCHAR(100),
    `device_brand` VARCHAR(100),
    `device_type` ENUM('fingerprint', 'face', 'iris', 'card', 'multi') DEFAULT 'fingerprint',
    
    `location_name` VARCHAR(100),
    `location_type` ENUM('entrance', 'exit', 'classroom', 'other') DEFAULT 'entrance',
    
    `api_url` VARCHAR(255),
    `api_key` VARCHAR(255),
    `polling_interval_minutes` INT DEFAULT 5,
    
    `is_active` BOOLEAN DEFAULT TRUE,
    `last_sync_time` TIMESTAMP NULL,
    `last_heartbeat` TIMESTAMP NULL,
    `sync_status` ENUM('online', 'offline', 'error') DEFAULT 'offline',
    
    `firmware_version` VARCHAR(50),
    
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    KEY `idx_school_id` (`school_id`),
    KEY `idx_is_active` (`is_active`),
    KEY `idx_sync_status` (`sync_status`),
    KEY `idx_last_sync_time` (`last_sync_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 2. Device User Mapping (Biometric ID to Person)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `device_users` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `school_id` BIGINT NOT NULL,
    `device_user_id` INT NOT NULL,
    
    `person_type` ENUM('student', 'teacher') NOT NULL,
    `person_id` BIGINT NOT NULL,
    
    `device_name` VARCHAR(100),
    
    `is_enrolled` BOOLEAN DEFAULT TRUE,
    `enrollment_date` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `unenrollment_date` TIMESTAMP NULL,
    
    `biometric_quality` INT,
    
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY `uk_school_device_user` (`school_id`, `device_user_id`),
    KEY `idx_school_id` (`school_id`),
    KEY `idx_person` (`person_type`, `person_id`),
    KEY `idx_is_enrolled` (`is_enrolled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 3. Attendance Rules Configuration
-- ============================================================================

CREATE TABLE IF NOT EXISTS `attendance_rules` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `school_id` BIGINT NOT NULL,
    
    `rule_name` VARCHAR(100) NOT NULL,
    `rule_description` TEXT,
    
    `arrival_start_time` TIME,
    `arrival_end_time` TIME,
    `late_threshold_minutes` INT DEFAULT 15,
    `absence_cutoff_time` TIME,
    `closing_time` TIME,
    
    `applies_to` ENUM('students', 'teachers', 'all') DEFAULT 'students',
    `applies_to_classes` VARCHAR(255),
    
    `auto_excuse_after_days` INT DEFAULT 0,
    `ignore_duplicate_scans_within_minutes` INT DEFAULT 2,
    
    `is_active` BOOLEAN DEFAULT TRUE,
    `effective_date` DATE,
    `end_date` DATE NULL,
    
    `priority` INT DEFAULT 100,
    
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    KEY `idx_school_id` (`school_id`),
    KEY `idx_is_active` (`is_active`),
    KEY `idx_effective_date` (`effective_date`),
    KEY `idx_priority` (`priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 4. Raw Attendance Logs (Machine Events)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `attendance_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `school_id` BIGINT NOT NULL,
    `device_id` BIGINT NOT NULL,
    `device_user_id` INT NOT NULL,
    
    `scan_timestamp` TIMESTAMP NOT NULL,
    `received_timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    `verification_status` ENUM('success', 'failed', 'unknown') DEFAULT 'success',
    `biometric_quality` INT,
    
    `device_log_id` VARCHAR(100),
    `device_sync_count` INT DEFAULT 1,
    
    `processing_status` ENUM('pending', 'processed', 'error', 'duplicate') DEFAULT 'pending',
    `process_error_message` TEXT,
    
    `mapped_device_user_id` BIGINT,
    
    `is_duplicate` BOOLEAN DEFAULT FALSE,
    `duplicate_of_log_id` BIGINT,
    `raw_data` JSON,
    
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE KEY `uk_school_duplicate` (`school_id`, `device_id`, `device_user_id`, `scan_timestamp`, `device_log_id`),
    KEY `idx_school_scan` (`school_id`, `scan_timestamp`),
    KEY `idx_device_user_scan` (`device_user_id`, `scan_timestamp`),
    KEY `idx_processing_status` (`processing_status`),
    KEY `idx_received_timestamp` (`received_timestamp`),
    KEY `idx_scan_timestamp` (`scan_timestamp`),
    KEY `idx_device_id` (`device_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 5. Daily Attendance (Processed Results)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `daily_attendance` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `school_id` BIGINT NOT NULL,
    `person_type` ENUM('student', 'teacher') NOT NULL,
    `person_id` BIGINT NOT NULL,
    
    `attendance_date` DATE NOT NULL,
    
    `status` ENUM('present', 'late', 'absent', 'excused', 'on_leave', 'pending') DEFAULT 'pending',
    
    `first_arrival_time` TIME,
    `last_departure_time` TIME,
    `arrival_device_id` BIGINT,
    
    `is_manual_entry` BOOLEAN DEFAULT FALSE,
    `manual_entry_id` BIGINT,
    
    `is_late` BOOLEAN DEFAULT FALSE,
    `late_minutes` INT DEFAULT 0,
    `late_reason` VARCHAR(255),
    
    `excuse_type` ENUM('medical', 'parental', 'official', 'other', 'none') DEFAULT 'none',
    `excuse_note` TEXT,
    
    `marking_rule_id` BIGINT,
    `processing_metadata` JSON,
    
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `processed_at` TIMESTAMP,
    
    UNIQUE KEY `uk_school_person_date` (`school_id`, `person_type`, `person_id`, `attendance_date`),
    KEY `idx_school_date` (`school_id`, `attendance_date`),
    KEY `idx_person` (`person_type`, `person_id`),
    KEY `idx_status` (`status`),
    KEY `idx_is_manual` (`is_manual_entry`),
    KEY `idx_is_late` (`is_late`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 6. Manual Attendance Entries (Admin Override)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `manual_attendance_entries` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `school_id` BIGINT NOT NULL,
    `daily_attendance_id` BIGINT NOT NULL,
    
    `person_type` ENUM('student', 'teacher') NOT NULL,
    `person_id` BIGINT NOT NULL,
    `attendance_date` DATE NOT NULL,
    
    `status` ENUM('present', 'late', 'absent', 'excused', 'on_leave') NOT NULL,
    `arrival_time` TIME,
    `departure_time` TIME,
    
    `reason` VARCHAR(255),
    `notes` TEXT,
    
    `override_type` ENUM('status_change', 'new_entry', 'excuse_update', 'time_correction') DEFAULT 'status_change',
    
    `previous_status` VARCHAR(50),
    `previous_arrival_time` TIME,
    `previous_departure_time` TIME,
    
    `created_by_user_id` BIGINT,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    `deleted_by_user_id` BIGINT,
    `deleted_at` TIMESTAMP NULL,
    
    KEY `idx_school_id` (`school_id`),
    KEY `idx_daily_attendance` (`daily_attendance_id`),
    KEY `idx_person` (`person_type`, `person_id`),
    KEY `idx_attendance_date` (`attendance_date`),
    KEY `idx_created_by` (`created_by_user_id`),
    KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 7. Attendance Audit Logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS `attendance_audit_logs` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `school_id` BIGINT NOT NULL,
    
    `entity_type` ENUM('daily_attendance', 'manual_entry', 'device', 'rule') NOT NULL,
    `entity_id` BIGINT NOT NULL,
    `change_type` ENUM('create', 'update', 'delete', 'process') NOT NULL,
    
    `user_id` BIGINT,
    `user_name` VARCHAR(100),
    `ip_address` VARCHAR(45),
    `user_agent` TEXT,
    
    `old_values` JSON,
    `new_values` JSON,
    `change_summary` VARCHAR(500),
    
    `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    KEY `idx_school_id` (`school_id`),
    KEY `idx_entity` (`entity_type`, `entity_id`),
    KEY `idx_user_id` (`user_id`),
    KEY `idx_timestamp` (`timestamp`),
    KEY `idx_change_type` (`change_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 8. Processing Queue (Async Job Management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `attendance_processing_queue` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `school_id` BIGINT NOT NULL,
    
    `job_type` ENUM(
        'process_device_logs',
        'calculate_daily_attendance',
        'recalculate_date_range',
        'rule_recalculation',
        'sync_device'
    ) NOT NULL,
    
    `parameters` JSON,
    
    `status` ENUM('queued', 'processing', 'completed', 'failed', 'retrying') DEFAULT 'queued',
    `priority` INT DEFAULT 0,
    
    `attempted_count` INT DEFAULT 0,
    `max_attempts` INT DEFAULT 3,
    
    `result` JSON,
    `error_message` TEXT,
    `error_details` JSON,
    
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `started_at` TIMESTAMP NULL,
    `completed_at` TIMESTAMP NULL,
    `next_retry_at` TIMESTAMP NULL,
    
    KEY `idx_school_status` (`school_id`, `status`),
    KEY `idx_status` (`status`),
    KEY `idx_priority` (`priority`),
    KEY `idx_created_at` (`created_at`),
    KEY `idx_next_retry` (`next_retry_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 9. Device Sync Checkpoints
-- ============================================================================

CREATE TABLE IF NOT EXISTS `device_sync_checkpoints` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `school_id` BIGINT NOT NULL,
    `device_id` BIGINT NOT NULL,
    
    `last_synced_device_time` TIMESTAMP,
    `last_synced_remote_time` TIMESTAMP,
    
    `total_logs_synced` BIGINT DEFAULT 0,
    `failed_sync_attempts` INT DEFAULT 0,
    
    `is_syncing` BOOLEAN DEFAULT FALSE,
    `sync_status` ENUM('success', 'partial', 'failed') DEFAULT 'success',
    
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY `uk_device` (`school_id`, `device_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 10. Attendance Users (RBAC)
-- ============================================================================

CREATE TABLE IF NOT EXISTS `attendance_users` (
    `id` BIGINT PRIMARY KEY AUTO_INCREMENT,
    `school_id` BIGINT NOT NULL,
    
    `email` VARCHAR(100) UNIQUE,
    `username` VARCHAR(50) UNIQUE,
    `password_hash` VARCHAR(255),
    
    `first_name` VARCHAR(100),
    `last_name` VARCHAR(100),
    `phone` VARCHAR(20),
    
    `role` ENUM('admin', 'director', 'teacher', 'parent', 'student', 'staff') DEFAULT 'staff',
    
    `is_active` BOOLEAN DEFAULT TRUE,
    `email_verified` BOOLEAN DEFAULT FALSE,
    
    `last_login_at` TIMESTAMP NULL,
    `last_login_ip` VARCHAR(45),
    `password_changed_at` TIMESTAMP,
    
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    KEY `idx_school_id` (`school_id`),
    KEY `idx_email` (`email`),
    KEY `idx_role` (`role`),
    KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- 11. VIEWS FOR COMMON QUERIES
-- ============================================================================

CREATE OR REPLACE VIEW `v_today_arrivals` AS
SELECT 
    da.school_id,
    da.person_id,
    CASE 
        WHEN da.person_type = 'student' THEN s.student_id_number
        ELSE t.teacher_id_number
    END as person_id_number,
    CASE 
        WHEN da.person_type = 'student' THEN CONCAT(s.first_name, ' ', s.last_name)
        ELSE CONCAT(t.first_name, ' ', t.last_name)
    END as person_name,
    da.person_type,
    da.status,
    da.first_arrival_time,
    TIMESTAMPDIFF(MINUTE, CAST(CONCAT(CURDATE(), ' ', '08:00') AS DATETIME), 
                  CAST(CONCAT(CURDATE(), ' ', da.first_arrival_time) AS DATETIME)) as late_minutes,
    bd.location_name as arrival_device_location
FROM daily_attendance da
LEFT JOIN students s ON da.person_id = s.id AND da.person_type = 'student'
LEFT JOIN teachers t ON da.person_id = t.id AND da.person_type = 'teacher'
LEFT JOIN biometric_devices bd ON da.arrival_device_id = bd.id
WHERE DATE(da.attendance_date) = CURDATE()
ORDER BY da.first_arrival_time DESC;

CREATE OR REPLACE VIEW `v_class_attendance_summary` AS
SELECT 
    c.school_id,
    c.id as class_id,
    c.class_name,
    DATE(da.attendance_date) as date,
    COUNT(DISTINCT s.id) as total_strength,
    SUM(CASE WHEN da.status IN ('present', 'late') THEN 1 ELSE 0 END) as present_count,
    SUM(CASE WHEN da.status = 'late' THEN 1 ELSE 0 END) as late_count,
    SUM(CASE WHEN da.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
    SUM(CASE WHEN da.status = 'excused' THEN 1 ELSE 0 END) as excused_count,
    ROUND(
        (SUM(CASE WHEN da.status IN ('present', 'late') THEN 1 ELSE 0 END) / 
         COUNT(DISTINCT s.id)) * 100, 2
    ) as attendance_percentage
FROM classes c
LEFT JOIN students s ON c.id = s.class_id AND s.status = 'enrolled'
LEFT JOIN daily_attendance da ON s.id = da.person_id 
    AND da.person_type = 'student' 
    AND da.attendance_date = CURDATE()
WHERE c.is_active = TRUE
GROUP BY c.school_id, c.id, c.class_name, DATE(da.attendance_date);

-- ============================================================================
-- 12. INSERT SAMPLE ATTENDANCE RULES FOR EXISTING SCHOOL
-- ============================================================================

INSERT IGNORE INTO `attendance_rules` (
    `school_id`, `rule_name`, `arrival_start_time`, `arrival_end_time`, 
    `late_threshold_minutes`, `absence_cutoff_time`, `closing_time`, `applies_to`
)
SELECT 
    `id`, 'Student Standard Rules', '06:00:00', '08:00:00', 
    15, '09:00:00', '15:00:00', 'students'
FROM `schools`
LIMIT 1;

INSERT IGNORE INTO `attendance_rules` (
    `school_id`, `rule_name`, `arrival_start_time`, `arrival_end_time`, 
    `late_threshold_minutes`, `absence_cutoff_time`, `closing_time`, `applies_to`
)
SELECT 
    `id`, 'Teacher Standard Rules', '06:30:00', '08:30:00', 
    10, '09:30:00', '15:00:00', 'teachers'
FROM `schools`
LIMIT 1;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

SELECT 'Attendance Management System successfully integrated with drais_school!' as `status`;
