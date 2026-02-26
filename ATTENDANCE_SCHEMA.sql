-- DRACE Attendance Management System - Database Schema
-- Production-ready schema with proper indexing for 1M+ logs

-- ============================================================================
-- Core Tenant & School Management
-- ============================================================================

CREATE TABLE IF NOT EXISTS schools (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    tenant_id BIGINT NOT NULL,
    school_code VARCHAR(50) UNIQUE NOT NULL,
    school_name VARCHAR(255) NOT NULL,
    school_address TEXT,
    city VARCHAR(100),
    country VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(100),
    logo_url VARCHAR(255),
    
    -- Configuration
    timezone VARCHAR(50) DEFAULT 'Asia/Riyadh',
    currency_code VARCHAR(3) DEFAULT 'SAR',
    
    -- School status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    KEY idx_tenant_id (tenant_id),
    KEY idx_is_active (is_active),
    KEY idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Students & Teachers
-- ============================================================================

CREATE TABLE IF NOT EXISTS students (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    student_id_number VARCHAR(50) NOT NULL, -- e.g., admission number
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(100),
    phone VARCHAR(20),
    
    -- Enrollment
    class_id BIGINT,
    enrollment_date DATE,
    status ENUM('enrolled', 'graduated', 'transferred', 'inactive') DEFAULT 'enrolled',
    
    -- Parent info (simplified)
    parent_name VARCHAR(100),
    parent_phone VARCHAR(20),
    
    -- Metadata
    date_of_birth DATE,
    gender ENUM('male', 'female', 'other'),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_school_student_id (school_id, student_id_number),
    KEY idx_school_id (school_id),
    KEY idx_class_id (class_id),
    KEY idx_status (status),
    KEY idx_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS teachers (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    teacher_id_number VARCHAR(50) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    
    -- Assignment
    department VARCHAR(100),
    designation VARCHAR(100),
    status ENUM('active', 'on_leave', 'inactive') DEFAULT 'active',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_school_teacher_id (school_id, teacher_id_number),
    KEY idx_school_id (school_id),
    KEY idx_email (email),
    KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Classes & Time Tables
-- ============================================================================

CREATE TABLE IF NOT EXISTS classes (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    class_code VARCHAR(50) NOT NULL,
    class_name VARCHAR(100) NOT NULL,
    grade_level INT,
    section VARCHAR(50),
    
    -- Class information
    capacity INT,
    class_teacher_id BIGINT,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_school_class (school_id, class_code),
    KEY idx_school_id (school_id),
    KEY idx_is_active (is_active),
    FOREIGN KEY fk_class_teacher (class_teacher_id) REFERENCES teachers(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Biometric Device Management
-- ============================================================================

CREATE TABLE IF NOT EXISTS biometric_devices (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    device_id VARCHAR(100) NOT NULL, -- Device serial or MAC address
    device_name VARCHAR(100),
    device_model VARCHAR(100),
    device_brand VARCHAR(100), -- HID, ZKTeco, U-Attendance, etc.
    device_type ENUM('fingerprint', 'face', 'iris', 'card', 'multi') DEFAULT 'fingerprint',
    
    -- Location in school
    location_name VARCHAR(100), -- e.g., "Main Gate", "Class 1A Door"
    location_type ENUM('entrance', 'exit', 'classroom', 'other') DEFAULT 'entrance',
    
    -- Configuration
    api_url VARCHAR(255),
    api_key VARCHAR(255), -- Encrypted
    polling_interval_minutes INT DEFAULT 5,
    
    -- Status & Sync
    is_active BOOLEAN DEFAULT TRUE,
    last_sync_time TIMESTAMP NULL,
    last_heartbeat TIMESTAMP NULL,
    sync_status ENUM('online', 'offline', 'error') DEFAULT 'offline',
    
    firmware_version VARCHAR(50),
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_school_device_id (school_id, device_id),
    KEY idx_school_id (school_id),
    KEY idx_is_active (is_active),
    KEY idx_sync_status (sync_status),
    KEY idx_last_sync_time (last_sync_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Device User Mapping (Biometric Data to Person)
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    device_user_id INT NOT NULL, -- ID on the device itself
    
    -- Person mapping (polymorphic - either student or teacher)
    person_type ENUM('student', 'teacher') NOT NULL,
    person_id BIGINT NOT NULL, -- References either students.id or teachers.id
    
    -- Name on device (for verification)
    device_name VARCHAR(100),
    
    -- Enrollment status
    is_enrolled BOOLEAN DEFAULT TRUE,
    enrollment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    unenrollment_date TIMESTAMP NULL,
    
    -- Metadata
    biometric_quality INT, -- 0-100 (quality of fingerprint/biometric)
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_school_device_user_id (school_id, device_user_id),
    KEY idx_school_id (school_id),
    KEY idx_person (person_type, person_id),
    KEY idx_is_enrolled (is_enrolled),
    CONSTRAINT chk_device_user_mapping CHECK (
        (person_type = 'student') OR (person_type = 'teacher')
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Attendance Rules (Per School Configuration)
-- ============================================================================

CREATE TABLE IF NOT EXISTS attendance_rules (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    
    -- Rule name and description
    rule_name VARCHAR(100) NOT NULL,
    rule_description TEXT,
    
    -- Time windows (in HH:MM format or minutes from midnight)
    arrival_start_time TIME, -- Earliest valid arrival (e.g., 06:00)
    arrival_end_time TIME,   -- Latest time to be marked present (e.g., 08:00)
    late_threshold_minutes INT DEFAULT 15, -- Minutes after arrival_end_time
    absence_cutoff_time TIME, -- After this time, mark absent (e.g., 09:00)
    closing_time TIME, -- After this, departure scans are recorded (e.g., 15:00)
    
    -- Rule application
    applies_to ENUM('students', 'teachers', 'all') DEFAULT 'students',
    applies_to_classes VARCHAR(255), -- JSON array of class IDs if selective
    
    -- Grace periods and special handling
    auto_excuse_after_days INT DEFAULT 0, -- Auto mark as excused after X days
    ignore_duplicate_scans_within_minutes INT DEFAULT 2,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    effective_date DATE,
    end_date DATE NULL,
    
    -- Priority for rule evaluation
    priority INT DEFAULT 100,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    KEY idx_school_id (school_id),
    KEY idx_is_active (is_active),
    KEY idx_effective_date (effective_date),
    KEY idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Raw Attendance Logs (Machine Events)
-- Partitioned by month/date for performance
-- ============================================================================

CREATE TABLE IF NOT EXISTS attendance_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    device_id BIGINT NOT NULL,
    device_user_id INT NOT NULL,
    
    -- Timestamp information
    scan_timestamp TIMESTAMP NOT NULL, -- When the scan occurred on device
    received_timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP, -- When we received it
    
    -- Biometric data
    verification_status ENUM('success', 'failed', 'unknown') DEFAULT 'success',
    biometric_quality INT, -- 0-100
    
    -- Device-side info
    device_log_id VARCHAR(100), -- Unique ID from device to detect duplicates
    device_sync_count INT DEFAULT 1, -- How many times this was synced
    
    -- Processing status
    processing_status ENUM('pending', 'processed', 'error', 'duplicate') DEFAULT 'pending',
    process_error_message TEXT,
    
    -- Tentative attendance mapping (at log time)
    mapped_device_user_id BIGINT, -- Foreign key to device_users.id
    
    -- Metadata
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_of_log_id BIGINT,
    raw_data JSON, -- Store additional device-specific data
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes optimized for 1M+ logs
    UNIQUE KEY uk_school_duplicate (school_id, device_id, device_user_id, scan_timestamp, device_log_id),
    KEY idx_school_scan (school_id, scan_timestamp),
    KEY idx_device_user_scan (device_user_id, scan_timestamp),
    KEY idx_processing_status (processing_status),
    KEY idx_received_timestamp (received_timestamp),
    KEY idx_scan_timestamp (scan_timestamp),
    FOREIGN KEY fk_school (school_id) REFERENCES schools(id),
    FOREIGN KEY fk_device (device_id) REFERENCES biometric_devices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (YEAR(scan_timestamp) * 10000 + MONTH(scan_timestamp) * 100 + DAY(scan_timestamp)) (
    PARTITION p_default VALUES LESS THAN (202601),
    PARTITION p_202601 VALUES LESS THAN (202602),
    PARTITION p_202602 VALUES LESS THAN (202603)
) -- Add new partitions quarterly
;

-- ============================================================================
-- Daily Attendance (Processed & Final)
-- ============================================================================

CREATE TABLE IF NOT EXISTS daily_attendance (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    person_type ENUM('student', 'teacher') NOT NULL,
    person_id BIGINT NOT NULL,
    
    -- Date information
    attendance_date DATE NOT NULL,
    
    -- Attendance status
    status ENUM('present', 'late', 'absent', 'excused', 'on_leave', 'pending') DEFAULT 'pending',
    
    -- Timing
    first_arrival_time TIME, -- Time of first valid scan
    last_departure_time TIME, -- Time of departure (last scan after closing_time)
    arrival_device_id BIGINT, -- Which device recorded arrival
    
    -- Processing information
    is_manual_entry BOOLEAN DEFAULT FALSE,
    manual_entry_id BIGINT, -- Reference to manual_attendance_entries if manual
    
    -- Late tracking
    is_late BOOLEAN DEFAULT FALSE,
    late_minutes INT DEFAULT 0, -- Minutes after late threshold
    late_reason VARCHAR(255),
    
    -- Excuse information
    excuse_type ENUM('medical', 'parental', 'official', 'other', 'none') DEFAULT 'none',
    excuse_note TEXT,
    
    -- Metadata
    marking_rule_id BIGINT, -- Which rule was used to determine status
    processing_metadata JSON, -- Store processing details
    
    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    
    UNIQUE KEY uk_school_person_date (school_id, person_type, person_id, attendance_date),
    KEY idx_school_date (school_id, attendance_date),
    KEY idx_person (person_type, person_id),
    KEY idx_status (status),
    KEY idx_is_manual (is_manual_entry),
    KEY idx_is_late (is_late),
    FOREIGN KEY fk_school (school_id) REFERENCES schools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Manual Attendance Entries (Admin Override)
-- ============================================================================

CREATE TABLE IF NOT EXISTS manual_attendance_entries (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    daily_attendance_id BIGINT NOT NULL,
    
    -- Person & Date
    person_type ENUM('student', 'teacher') NOT NULL,
    person_id BIGINT NOT NULL,
    attendance_date DATE NOT NULL,
    
    -- Manual entry details
    status ENUM('present', 'late', 'absent', 'excused', 'on_leave') NOT NULL,
    arrival_time TIME,
    departure_time TIME,
    
    -- Reason & notes
    reason VARCHAR(255),
    notes TEXT,
    
    -- Override type
    override_type ENUM('status_change', 'new_entry', 'excuse_update', 'time_correction') DEFAULT 'status_change',
    
    -- Previous value (for audit)
    previous_status VARCHAR(50), -- JSON or string representation
    previous_arrival_time TIME,
    previous_departure_time TIME,
    
    -- Audit trail
    created_by_user_id BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Soft delete
    deleted_by_user_id BIGINT,
    deleted_at TIMESTAMP NULL,
    
    KEY idx_school_id (school_id),
    KEY idx_daily_attendance (daily_attendance_id),
    KEY idx_person (person_type, person_id),
    KEY idx_attendance_date (attendance_date),
    KEY idx_created_by (created_by_user_id),
    KEY idx_created_at (created_at),
    FOREIGN KEY fk_school (school_id) REFERENCES schools(id),
    FOREIGN KEY fk_daily_attendance (daily_attendance_id) REFERENCES daily_attendance(id),
    FOREIGN KEY fk_created_by (created_by_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Audit Logs (Full Audit Trail)
-- ============================================================================

CREATE TABLE IF NOT EXISTS attendance_audit_logs (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    
    -- What was changed
    entity_type ENUM('daily_attendance', 'manual_entry', 'device', 'rule') NOT NULL,
    entity_id BIGINT NOT NULL,
    change_type ENUM('create', 'update', 'delete', 'process') NOT NULL,
    
    -- Who & When
    user_id BIGINT,
    user_name VARCHAR(100),
    ip_address VARCHAR(45), -- IPv6 compatible
    user_agent TEXT,
    
    -- What changed
    old_values JSON,
    new_values JSON,
    change_summary VARCHAR(500),
    
    -- Metadata
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    KEY idx_school_id (school_id),
    KEY idx_entity (entity_type, entity_id),
    KEY idx_user_id (user_id),
    KEY idx_timestamp (timestamp),
    KEY idx_change_type (change_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Processing Queue (For async job management)
-- ============================================================================

CREATE TABLE IF NOT EXISTS attendance_processing_queue (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    
    -- Job details
    job_type ENUM(
        'process_device_logs',
        'calculate_daily_attendance',
        'recalculate_date_range',
        'rule_recalculation',
        'sync_device'
    ) NOT NULL,
    
    -- Job parameters
    parameters JSON, -- Flexible storage for job-specific params
    
    -- Status tracking
    status ENUM('queued', 'processing', 'completed', 'failed', 'retrying') DEFAULT 'queued',
    priority INT DEFAULT 0,
    
    -- Processing
    attempted_count INT DEFAULT 0,
    max_attempts INT DEFAULT 3,
    
    -- Results
    result JSON,
    error_message TEXT,
    error_details JSON,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    next_retry_at TIMESTAMP NULL,
    
    KEY idx_school_status (school_id, status),
    KEY idx_status (status),
    KEY idx_priority (priority),
    KEY idx_created_at (created_at),
    KEY idx_next_retry (next_retry_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Device Sync Checkpoint (To track last successful sync)
-- ============================================================================

CREATE TABLE IF NOT EXISTS device_sync_checkpoints (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    device_id BIGINT NOT NULL,
    
    -- Last synced timestamp
    last_synced_device_time TIMESTAMP,
    last_synced_remote_time TIMESTAMP,
    
    -- Sync statistics
    total_logs_synced BIGINT DEFAULT 0,
    failed_sync_attempts INT DEFAULT 0,
    
    -- Status
    is_syncing BOOLEAN DEFAULT FALSE,
    sync_status ENUM('success', 'partial', 'failed') DEFAULT 'success',
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    UNIQUE KEY uk_device (school_id, device_id),
    FOREIGN KEY fk_school (school_id) REFERENCES schools(id),
    FOREIGN KEY fk_device (device_id) REFERENCES biometric_devices(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- Users (For RBAC)
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    school_id BIGINT NOT NULL,
    
    -- Auth info
    email VARCHAR(100) NOT NULL UNIQUE,
    username VARCHAR(50) UNIQUE,
    password_hash VARCHAR(255),
    
    -- Profile
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    phone VARCHAR(20),
    
    -- Role & permissions
    role ENUM('admin', 'director', 'teacher', 'parent', 'student', 'staff') DEFAULT 'staff',
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    email_verified BOOLEAN DEFAULT FALSE,
    
    -- Auth tracking
    last_login_at TIMESTAMP NULL,
    last_login_ip VARCHAR(45),
    password_changed_at TIMESTAMP,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    KEY idx_school_id (school_id),
    KEY idx_email (email),
    KEY idx_role (role),
    KEY idx_is_active (is_active),
    FOREIGN KEY fk_school (school_id) REFERENCES schools(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Current day real-time arrivals view
CREATE OR REPLACE VIEW v_today_arrivals AS
SELECT 
    da.school_id,
    da.person_id,
    s.student_id_number,
    s.first_name,
    s.last_name,
    c.class_name,
    da.status,
    da.first_arrival_time,
    TIMESTAMPDIFF(MINUTE, ar.arrival_end_time, da.first_arrival_time) as late_minutes,
    bd.location_name as arrival_device_location
FROM daily_attendance da
LEFT JOIN students s ON da.person_id = s.id AND da.person_type = 'student'
LEFT JOIN classes c ON s.class_id = c.id
LEFT JOIN attendance_rules ar ON ar.school_id = da.school_id AND ar.is_active = TRUE
LEFT JOIN biometric_devices bd ON da.arrival_device_id = bd.id
WHERE DATE(da.attendance_date) = CURDATE()
    AND da.person_type = 'student'
ORDER BY da.first_arrival_time DESC;

-- Attendance summary by class view
CREATE OR REPLACE VIEW v_class_attendance_summary AS
SELECT 
    c.school_id,
    c.id as class_id,
    c.class_name,
    DATE(da.attendance_date) as date,
    COUNT(DISTINCT da.person_id) as total_strength,
    SUM(CASE WHEN da.status IN ('present', 'late') THEN 1 ELSE 0 END) as present_count,
    SUM(CASE WHEN da.status = 'late' THEN 1 ELSE 0 END) as late_count,
    SUM(CASE WHEN da.status = 'absent' THEN 1 ELSE 0 END) as absent_count,
    SUM(CASE WHEN da.status = 'excused' THEN 1 ELSE 0 END) as excused_count,
    ROUND(
        (SUM(CASE WHEN da.status IN ('present', 'late') THEN 1 ELSE 0 END) / 
         COUNT(DISTINCT da.person_id)) * 100, 2
    ) as attendance_percentage
FROM classes c
LEFT JOIN students s ON c.id = s.class_id
LEFT JOIN daily_attendance da ON s.id = da.person_id 
    AND da.person_type = 'student' 
    AND da.attendance_date = CURDATE()
WHERE c.is_active = TRUE
GROUP BY c.school_id, c.id, c.class_name, DATE(da.attendance_date);

-- ============================================================================
-- SAMPLE DATA (for testing)
-- ============================================================================

-- Schools
INSERT INTO schools (tenant_id, school_code, school_name, timezone)
VALUES (1, 'SCH001', 'Example School', 'Asia/Riyadh');

-- Classes
INSERT INTO classes (school_id, class_code, class_name, grade_level)
SELECT id, 'CLASS001', 'Grade 1 - Section A', 1 FROM schools WHERE school_code = 'SCH001';

-- Teachers
INSERT INTO teachers (school_id, teacher_id_number, first_name, last_name, email)
VALUES 
    (1, 'TCH001', 'Ahmed', 'Ali', 'ahmed@school.edu'),
    (1, 'TCH002', 'Fatima', 'Hassan', 'fatima@school.edu');

-- Attendance Rules
INSERT INTO attendance_rules (
    school_id, rule_name, arrival_start_time, arrival_end_time, 
    late_threshold_minutes, absence_cutoff_time, closing_time, applies_to
)
VALUES (
    1, 'Student Standard Rules', 
    '06:00:00', '08:00:00', 15, '09:00:00', '15:00:00', 'students'
);
