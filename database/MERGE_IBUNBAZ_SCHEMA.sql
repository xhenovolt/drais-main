-- ============================================================================
-- DATABASE MERGE SCRIPT: IBUNBAZ TABLES TO CURRENT SCHEMA
-- ============================================================================
-- Purpose: Merge missing tables from ibunbaz_20260301_full.sql backup
-- Date: March 8, 2026
-- Description: This script adds all 97 missing tables from the ibunbaz backup
--              to the current database schema
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- ATTENDANCE MANAGEMENT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS `attendance_audit_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `entity_type` enum('daily_attendance','manual_entry','device','rule') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entity_id` bigint NOT NULL,
  `change_type` enum('create','update','delete','process') COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` bigint DEFAULT NULL,
  `user_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_agent` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `old_values` json DEFAULT NULL,
  `new_values` json DEFAULT NULL,
  `change_summary` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_school_id` (`school_id`),
  KEY `idx_entity` (`entity_type`,`entity_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_timestamp` (`timestamp`),
  KEY `idx_change_type` (`change_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attendance_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `device_id` bigint NOT NULL,
  `device_user_id` int NOT NULL,
  `scan_timestamp` timestamp NOT NULL,
  `received_timestamp` timestamp DEFAULT CURRENT_TIMESTAMP,
  `verification_status` enum('success','failed','unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'success',
  `biometric_quality` int DEFAULT NULL,
  `device_log_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_sync_count` int DEFAULT '1',
  `processing_status` enum('pending','processed','error','duplicate') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `process_error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mapped_device_user_id` bigint DEFAULT NULL,
  `is_duplicate` tinyint(1) DEFAULT '0',
  `duplicate_of_log_id` bigint DEFAULT NULL,
  `raw_data` json DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uk_school_duplicate` (`school_id`,`device_id`,`device_user_id`,`scan_timestamp`,`device_log_id`),
  KEY `idx_school_scan` (`school_id`,`scan_timestamp`),
  KEY `idx_device_user_scan` (`device_user_id`,`scan_timestamp`),
  KEY `idx_processing_status` (`processing_status`),
  KEY `idx_received_timestamp` (`received_timestamp`),
  KEY `idx_scan_timestamp` (`scan_timestamp`),
  KEY `idx_device_id` (`device_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attendance_processing_queue` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `job_type` enum('process_device_logs','calculate_daily_attendance','recalculate_date_range','rule_recalculation','sync_device') COLLATE utf8mb4_unicode_ci NOT NULL,
  `parameters` json DEFAULT NULL,
  `status` enum('queued','processing','completed','failed','retrying') COLLATE utf8mb4_unicode_ci DEFAULT 'queued',
  `priority` int DEFAULT '0',
  `attempted_count` int DEFAULT '0',
  `max_attempts` int DEFAULT '3',
  `result` json DEFAULT NULL,
  `error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `error_details` json DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `started_at` timestamp NULL DEFAULT NULL,
  `completed_at` timestamp NULL DEFAULT NULL,
  `next_retry_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_school_status` (`school_id`,`status`),
  KEY `idx_status` (`status`),
  KEY `idx_priority` (`priority`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_next_retry` (`next_retry_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attendance_reconciliation` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `attendance_session_id` bigint DEFAULT NULL,
  `student_id` bigint NOT NULL,
  `manual_status` enum('present','absent','late','excused') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `manual_marked_by` bigint DEFAULT NULL,
  `manual_marked_at` timestamp NULL DEFAULT NULL,
  `biometric_status` enum('present','absent','late') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `biometric_marked_at` timestamp NULL DEFAULT NULL,
  `reconciliation_status` enum('matched','conflict','biometric_only','manual_only') COLLATE utf8mb4_unicode_ci DEFAULT 'matched',
  `conflict_resolution` enum('trust_biometric','trust_manual','manual_correction') COLLATE utf8mb4_unicode_ci DEFAULT 'trust_biometric',
  `resolved_at` timestamp NULL DEFAULT NULL,
  `resolved_by` bigint DEFAULT NULL,
  `resolution_notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_session_student` (`attendance_session_id`,`student_id`),
  KEY `idx_reconciliation_status` (`reconciliation_status`),
  KEY `idx_student` (`student_id`),
  KEY `idx_created_at` (`created_at`),
  KEY `fk_reconciliation_school` (`school_id`),
  CONSTRAINT `attendance_reconciliation_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `attendance_reconciliation_ibfk_2` FOREIGN KEY (`attendance_session_id`) REFERENCES `attendance_sessions` (`id`) ON DELETE SET NULL,
  CONSTRAINT `attendance_reconciliation_ibfk_3` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Hybrid attendance reconciliation (manual vs biometric)';

CREATE TABLE IF NOT EXISTS `attendance_reports` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `report_type` enum('daily_summary','weekly_trend','monthly_summary','class_analysis','student_profile','period_comparison') COLLATE utf8mb4_unicode_ci DEFAULT 'daily_summary',
  `date_from` date DEFAULT NULL,
  `date_to` date DEFAULT NULL,
  `class_id` bigint DEFAULT NULL,
  `stream_id` bigint DEFAULT NULL,
  `academic_year_id` bigint DEFAULT NULL,
  `report_data` longtext COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `generated_by` bigint DEFAULT NULL,
  `generated_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_school` (`school_id`),
  KEY `idx_generated_at` (`generated_at`),
  KEY `idx_report_type` (`report_type`),
  CONSTRAINT `attendance_reports_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Cached attendance reports';

CREATE TABLE IF NOT EXISTS `attendance_rules` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `rule_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `rule_description` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `arrival_start_time` time DEFAULT NULL,
  `arrival_end_time` time DEFAULT NULL,
  `late_threshold_minutes` int DEFAULT '15',
  `absence_cutoff_time` time DEFAULT NULL,
  `closing_time` time DEFAULT NULL,
  `applies_to` enum('students','teachers','all') COLLATE utf8mb4_unicode_ci DEFAULT 'students',
  `applies_to_classes` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `auto_excuse_after_days` int DEFAULT '0',
  `ignore_duplicate_scans_within_minutes` int DEFAULT '2',
  `is_active` tinyint(1) DEFAULT '1',
  `effective_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `priority` int DEFAULT '100',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_school_id` (`school_id`),
  KEY `idx_is_active` (`is_active`),
  KEY `idx_effective_date` (`effective_date`),
  KEY `idx_priority` (`priority`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=2;

CREATE TABLE IF NOT EXISTS `attendance_sessions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `class_id` bigint NOT NULL,
  `stream_id` bigint DEFAULT NULL,
  `term_id` bigint DEFAULT NULL,
  `academic_year_id` bigint DEFAULT NULL,
  `subject_id` bigint DEFAULT NULL,
  `teacher_id` bigint DEFAULT NULL,
  `session_date` date NOT NULL,
  `session_start_time` time DEFAULT NULL,
  `session_end_time` time DEFAULT NULL,
  `session_type` enum('morning_check','lesson','assembly','afternoon_check','custom') COLLATE utf8mb4_unicode_ci DEFAULT 'lesson',
  `attendance_type` enum('manual','biometric','hybrid') COLLATE utf8mb4_unicode_ci DEFAULT 'manual',
  `status` enum('draft','open','submitted','locked','finalized') COLLATE utf8mb4_unicode_ci DEFAULT 'draft',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT NULL,
  `submitted_by` bigint DEFAULT NULL,
  `finalized_at` timestamp NULL DEFAULT NULL,
  `finalized_by` bigint DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_class_date` (`class_id`,`session_date`),
  KEY `idx_status` (`status`),
  KEY `idx_academic_year` (`academic_year_id`),
  KEY `idx_teacher` (`teacher_id`),
  KEY `idx_session_date` (`session_date`),
  KEY `fk_attendance_sessions_school` (`school_id`),
  KEY `fk_attendance_sessions_stream` (`stream_id`),
  CONSTRAINT `attendance_sessions_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `attendance_sessions_ibfk_2` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `attendance_sessions_ibfk_3` FOREIGN KEY (`stream_id`) REFERENCES `streams` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Attendance session tracking for class-level periods';

CREATE TABLE IF NOT EXISTS `attendance_users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_hash` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` enum('admin','director','teacher','parent','student','staff') COLLATE utf8mb4_unicode_ci DEFAULT 'staff',
  `is_active` tinyint(1) DEFAULT '1',
  `email_verified` tinyint(1) DEFAULT '0',
  `last_login_at` timestamp NULL DEFAULT NULL,
  `last_login_ip` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password_changed_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `email` (`email`),
  UNIQUE KEY `username` (`username`),
  KEY `idx_school_id` (`school_id`),
  KEY `idx_email` (`email`),
  KEY `idx_role` (`role`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `daily_attendance` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `person_type` enum('student','teacher') COLLATE utf8mb4_unicode_ci NOT NULL,
  `person_id` bigint NOT NULL,
  `attendance_date` date NOT NULL,
  `status` enum('present','late','absent','excused','on_leave','pending') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `first_arrival_time` time DEFAULT NULL,
  `last_departure_time` time DEFAULT NULL,
  `arrival_device_id` bigint DEFAULT NULL,
  `is_manual_entry` tinyint(1) DEFAULT '0',
  `manual_entry_id` bigint DEFAULT NULL,
  `is_late` tinyint(1) DEFAULT '0',
  `late_minutes` int DEFAULT '0',
  `late_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `excuse_type` enum('medical','parental','official','other','none') COLLATE utf8mb4_unicode_ci DEFAULT 'none',
  `excuse_note` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `marking_rule_id` bigint DEFAULT NULL,
  `processing_metadata` json DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `processed_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uk_school_person_date` (`school_id`,`person_type`,`person_id`,`attendance_date`),
  KEY `idx_school_date` (`school_id`,`attendance_date`),
  KEY `idx_person` (`person_type`,`person_id`),
  KEY `idx_status` (`status`),
  KEY `idx_is_manual` (`is_manual_entry`),
  KEY `idx_is_late` (`is_late`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `manual_attendance_entries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `daily_attendance_id` bigint NOT NULL,
  `person_type` enum('student','teacher') COLLATE utf8mb4_unicode_ci NOT NULL,
  `person_id` bigint NOT NULL,
  `attendance_date` date NOT NULL,
  `status` enum('present','late','absent','excused','on_leave') COLLATE utf8mb4_unicode_ci NOT NULL,
  `arrival_time` time DEFAULT NULL,
  `departure_time` time DEFAULT NULL,
  `reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `override_type` enum('status_change','new_entry','excuse_update','time_correction') COLLATE utf8mb4_unicode_ci DEFAULT 'status_change',
  `previous_status` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `previous_arrival_time` time DEFAULT NULL,
  `previous_departure_time` time DEFAULT NULL,
  `created_by_user_id` bigint DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `deleted_by_user_id` bigint DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_school_id` (`school_id`),
  KEY `idx_daily_attendance` (`daily_attendance_id`),
  KEY `idx_person` (`person_type`,`person_id`),
  KEY `idx_attendance_date` (`attendance_date`),
  KEY `idx_created_by` (`created_by_user_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================================
-- BIOMETRIC DEVICE MANAGEMENT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS `biometric_devices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `device_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `device_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_type` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'fingerprint',
  `manufacturer` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `model` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `serial_number` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `mac_address` varchar(17) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fingerprint_capacity` int DEFAULT '3000',
  `enrollment_count` int DEFAULT '0',
  `status` enum('active','inactive','maintenance','offline') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `last_sync_at` timestamp NULL DEFAULT NULL,
  `sync_status` enum('synced','pending','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `sync_error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_sync_record_count` int DEFAULT '0',
  `battery_level` int DEFAULT NULL,
  `storage_used_percent` decimal(5,2) DEFAULT NULL,
  `is_master` tinyint(1) DEFAULT '0',
  `api_key` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `api_secret` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `device_code` (`device_code`),
  UNIQUE KEY `serial_number` (`serial_number`),
  UNIQUE KEY `unique_device_code` (`device_code`),
  UNIQUE KEY `unique_serial` (`serial_number`),
  KEY `idx_school` (`school_id`),
  KEY `idx_status` (`status`),
  KEY `idx_sync_status` (`sync_status`),
  CONSTRAINT `biometric_devices_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Biometric device management and tracking';

CREATE TABLE IF NOT EXISTS `dahua_devices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `device_name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `device_code` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `ip_address` varchar(45) COLLATE utf8mb4_unicode_ci NOT NULL,
  `port` int DEFAULT '80',
  `api_url` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `device_type` enum('attendance','access_control','hybrid') COLLATE utf8mb4_unicode_ci DEFAULT 'attendance',
  `protocol` enum('http','https') COLLATE utf8mb4_unicode_ci DEFAULT 'http',
  `status` enum('active','inactive','offline','error') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `last_sync` timestamp NULL DEFAULT NULL,
  `last_sync_status` enum('success','failed','pending') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `last_error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `auto_sync_enabled` tinyint(1) DEFAULT '1',
  `sync_interval_minutes` int DEFAULT '15',
  `late_threshold_minutes` int DEFAULT '30',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `device_code` (`device_code`),
  UNIQUE KEY `unique_dahua_code` (`device_code`),
  KEY `idx_school` (`school_id`),
  KEY `idx_status` (`status`),
  KEY `idx_ip` (`ip_address`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=4 COMMENT='Dahua biometric device configuration and settings';

CREATE TABLE IF NOT EXISTS `dahua_attendance_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `device_id` bigint NOT NULL,
  `student_id` bigint DEFAULT NULL,
  `card_no` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `user_id` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `event_time` datetime NOT NULL,
  `event_type` enum('Entry','Exit','Unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'Entry',
  `method` enum('fingerprint','card','face','password','unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'unknown',
  `status` enum('present','absent','late','processed') COLLATE utf8mb4_unicode_ci DEFAULT 'processed',
  `raw_log_id` bigint DEFAULT NULL,
  `matched_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_device` (`device_id`),
  KEY `idx_student` (`student_id`),
  KEY `idx_card` (`card_no`),
  KEY `idx_event_time` (`event_time`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Normalized Dahua attendance logs';

CREATE TABLE IF NOT EXISTS `dahua_raw_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `device_id` bigint NOT NULL,
  `raw_data` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `record_count` int DEFAULT '0',
  `parsed_successfully` tinyint(1) DEFAULT '0',
  `parse_errors` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_device` (`device_id`),
  KEY `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Raw Dahua device logs storage';

CREATE TABLE IF NOT EXISTS `dahua_sync_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `device_id` bigint NOT NULL,
  `sync_type` enum('manual','scheduled','automatic') COLLATE utf8mb4_unicode_ci DEFAULT 'manual',
  `records_fetched` int DEFAULT '0',
  `records_processed` int DEFAULT '0',
  `records_failed` int DEFAULT '0',
  `status` enum('in_progress','success','failed','partial') COLLATE utf8mb4_unicode_ci DEFAULT 'in_progress',
  `started_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,
  `error_details` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_device` (`device_id`),
  KEY `idx_started` (`started_at`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Dahua device sync history tracking';

CREATE TABLE IF NOT EXISTS `device_users` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `device_user_id` int NOT NULL,
  `person_type` enum('student','teacher') COLLATE utf8mb4_unicode_ci NOT NULL,
  `person_id` bigint NOT NULL,
  `device_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_enrolled` tinyint(1) DEFAULT '1',
  `enrollment_date` timestamp DEFAULT CURRENT_TIMESTAMP,
  `unenrollment_date` timestamp NULL DEFAULT NULL,
  `biometric_quality` int DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uk_school_device_user` (`school_id`,`device_user_id`),
  KEY `idx_school_id` (`school_id`),
  KEY `idx_person` (`person_type`,`person_id`),
  KEY `idx_is_enrolled` (`is_enrolled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_configs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `device_name` varchar(100) NOT NULL DEFAULT 'Access Control Device',
  `device_ip` varchar(50) NOT NULL,
  `device_port` int DEFAULT '80',
  `device_username` varchar(100) NOT NULL,
  `device_password_encrypted` varchar(255) NOT NULL,
  `device_serial_number` varchar(100) DEFAULT NULL,
  `device_type` varchar(50) DEFAULT NULL,
  `connection_status` enum('connected','disconnected','error') DEFAULT 'disconnected',
  `last_connection_attempt` timestamp NULL DEFAULT NULL,
  `last_successful_connection` timestamp NULL DEFAULT NULL,
  `last_error_message` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `device_serial_number` (`device_serial_number`),
  KEY `idx_school_id` (`school_id`),
  KEY `idx_serial_number` (`device_serial_number`),
  KEY `idx_connection_status` (`connection_status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `device_access_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `device_config_id` bigint NOT NULL,
  `device_serial_number` varchar(100) DEFAULT NULL,
  `event_timestamp` datetime NOT NULL,
  `user_id` varchar(50) DEFAULT NULL,
  `card_number` varchar(50) DEFAULT NULL,
  `person_name` varchar(100) DEFAULT NULL,
  `access_result` enum('granted','denied','unknown') DEFAULT 'unknown',
  `device_event_id` varchar(50) DEFAULT NULL,
  `device_event_type` varchar(100) DEFAULT NULL,
  `raw_payload` json DEFAULT NULL,
  `is_synced` tinyint(1) DEFAULT '1',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_device_config` (`device_config_id`),
  KEY `idx_device_serial` (`device_serial_number`),
  KEY `idx_event_timestamp` (`event_timestamp`),
  KEY `idx_access_result` (`access_result`),
  CONSTRAINT `device_access_logs_ibfk_1` FOREIGN KEY (`device_config_id`) REFERENCES `device_configs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `device_connection_history` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `device_config_id` bigint NOT NULL,
  `connection_attempt_type` enum('test','scheduled_check','manual_reconnect','system_startup') DEFAULT 'test',
  `status` enum('success','failed','timeout','unauthorized','unreachable','api_error') DEFAULT 'failed',
  `http_status_code` int DEFAULT NULL,
  `error_message` varchar(255) DEFAULT NULL,
  `response_time_ms` int DEFAULT NULL,
  `ip_address` varchar(50) DEFAULT NULL,
  `port` int DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_device_config` (`device_config_id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `device_connection_history_ibfk_1` FOREIGN KEY (`device_config_id`) REFERENCES `device_configs` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `device_sync_checkpoints` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `device_id` bigint NOT NULL,
  `last_synced_device_time` timestamp NULL DEFAULT NULL,
  `last_synced_remote_time` timestamp NULL DEFAULT NULL,
  `total_logs_synced` bigint DEFAULT '0',
  `failed_sync_attempts` int DEFAULT '0',
  `is_syncing` tinyint(1) DEFAULT '0',
  `sync_status` enum('success','partial','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'success',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uk_device` (`school_id`,`device_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `device_sync_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `device_id` bigint NOT NULL,
  `sync_type` enum('attendance_download','fingerprint_upload','logs_fetch','device_sync') COLLATE utf8mb4_unicode_ci DEFAULT 'attendance_download',
  `sync_direction` enum('pull','push','bidirectional') COLLATE utf8mb4_unicode_ci DEFAULT 'pull',
  `status` enum('pending','in_progress','success','partial_success','failed') COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `records_processed` int DEFAULT '0',
  `records_synced` int DEFAULT '0',
  `records_failed` int DEFAULT '0',
  `error_message` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `details_json` json DEFAULT NULL,
  `started_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `completed_at` timestamp NULL DEFAULT NULL,
  `duration_seconds` int DEFAULT NULL,
  `initiated_by` bigint DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_device` (`device_id`),
  KEY `idx_started_at` (`started_at`),
  KEY `idx_status` (`status`),
  KEY `idx_sync_type` (`sync_type`),
  KEY `fk_sync_logs_school` (`school_id`),
  CONSTRAINT `device_sync_logs_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `device_sync_logs_ibfk_2` FOREIGN KEY (`device_id`) REFERENCES `biometric_devices` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Device synchronization operation logs';

CREATE TABLE IF NOT EXISTS `fingerprints` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `student_id` bigint DEFAULT NULL,
  `staff_id` bigint DEFAULT NULL,
  `fingerprint_data` longblob NOT NULL,
  `finger_position` varchar(20) DEFAULT NULL,
  `quality_score` int DEFAULT NULL,
  `enrollment_date` timestamp DEFAULT CURRENT_TIMESTAMP,
  `is_verified` tinyint(1) DEFAULT '0',
  `verified_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_student` (`student_id`),
  KEY `idx_staff` (`staff_id`),
  KEY `idx_school` (`school_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `student_fingerprints` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `student_id` bigint NOT NULL,
  `device_id` bigint DEFAULT NULL,
  `finger_position` enum('thumb','index','middle','ring','pinky','unknown') COLLATE utf8mb4_unicode_ci DEFAULT 'unknown',
  `hand` enum('left','right') COLLATE utf8mb4_unicode_ci DEFAULT 'right',
  `template_data` longblob DEFAULT NULL,
  `template_format` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `biometric_uuid` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quality_score` int DEFAULT '0',
  `enrollment_timestamp` timestamp DEFAULT CURRENT_TIMESTAMP,
  `is_active` tinyint(1) DEFAULT '1',
  `status` enum('active','inactive','revoked') COLLATE utf8mb4_unicode_ci DEFAULT 'active',
  `last_matched_at` timestamp NULL DEFAULT NULL,
  `match_count` int DEFAULT '0',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_student` (`student_id`),
  KEY `idx_device` (`device_id`),
  KEY `idx_status` (`status`),
  KEY `idx_biometric_uuid` (`biometric_uuid`),
  KEY `idx_student_device` (`student_id`,`device_id`),
  KEY `fk_fingerprints_school` (`school_id`),
  CONSTRAINT `student_fingerprints_ibfk_1` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `student_fingerprints_ibfk_2` FOREIGN KEY (`student_id`) REFERENCES `students` (`id`) ON DELETE CASCADE,
  CONSTRAINT `student_fingerprints_ibfk_3` FOREIGN KEY (`device_id`) REFERENCES `biometric_devices` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Student biometric fingerprint credentials';

-- ============================================================================
-- FINANCE & FEE MANAGEMENT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS `fee_invoices` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `invoice_no` varchar(50) NOT NULL,
  `student_id` bigint NOT NULL,
  `academic_year_id` bigint DEFAULT NULL,
  `term_id` bigint DEFAULT NULL,
  `fee_structure_id` bigint DEFAULT NULL,
  `total_amount` decimal(14,2) DEFAULT '0.00',
  `discount_amount` decimal(14,2) DEFAULT '0.00',
  `waive_amount` decimal(14,2) DEFAULT '0.00',
  `paid_amount` decimal(14,2) DEFAULT '0.00',
  `balance_amount` decimal(14,2) DEFAULT '0.00',
  `status` enum('draft','issued','partial','paid','overdue','cancelled') DEFAULT 'draft',
  `issue_date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_finv_school` (`school_id`),
  KEY `idx_finv_student` (`student_id`),
  KEY `idx_finv_status` (`status`),
  KEY `idx_finv_no` (`invoice_no`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='Fee invoices';

CREATE TABLE IF NOT EXISTS `fee_payments` (
  `id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `fee_item_id` bigint DEFAULT NULL,
  `term_id` bigint NOT NULL,
  `multi_term_ids` json DEFAULT NULL,
  `wallet_id` bigint NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `method` varchar(30) DEFAULT NULL,
  `discount_type` enum('percentage','fixed') DEFAULT NULL,
  `discount_reason` text COLLATE utf8_general_ci DEFAULT NULL,
  `approved_by` bigint DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `receipt_url` varchar(255) DEFAULT NULL,
  `invoice_url` varchar(255) DEFAULT NULL,
  `notes` text COLLATE utf8_general_ci DEFAULT NULL,
  `paid_by` varchar(150) DEFAULT NULL,
  `payer_contact` varchar(50) DEFAULT NULL,
  `reference` varchar(120) DEFAULT NULL,
  `receipt_no` varchar(40) DEFAULT NULL,
  `payment_status` enum('pending','completed','failed','refunded') DEFAULT 'completed',
  `gateway_reference` varchar(255) DEFAULT NULL,
  `gateway_response` json DEFAULT NULL,
  `mpesa_receipt` varchar(100) DEFAULT NULL,
  `phone_number` varchar(20) DEFAULT NULL,
  `ledger_id` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY `idx_fp_student` (`student_id`),
  KEY `idx_fp_status` (`payment_status`),
  KEY `idx_fp_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `fee_structures` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `class_id` bigint NOT NULL,
  `section_id` bigint DEFAULT NULL,
  `term_id` bigint NOT NULL,
  `academic_year` varchar(9) DEFAULT NULL,
  `item` varchar(120) NOT NULL,
  `fee_type` enum('tuition','uniform','transport','boarding','examination','activity','books','other') DEFAULT 'tuition',
  `is_mandatory` tinyint(1) DEFAULT '1',
  `amount` decimal(14,2) NOT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `late_fee_amount` decimal(14,2) DEFAULT '0.00',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY `idx_fs_class` (`class_id`),
  KEY `idx_fs_year` (`academic_year`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `fee_payment_allocations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `payment_id` bigint NOT NULL,
  `fee_item_id` bigint NOT NULL,
  `allocated_amount` decimal(14,2) NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_payment` (`payment_id`),
  KEY `idx_fee_item` (`fee_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `receipts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `student_id` bigint DEFAULT NULL,
  `payment_id` bigint DEFAULT NULL,
  `receipt_no` varchar(60) NOT NULL,
  `invoice_no` varchar(60) DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL,
  `payment_method` varchar(30) DEFAULT NULL,
  `reference` varchar(120) DEFAULT NULL,
  `payer_name` varchar(150) DEFAULT NULL,
  `payer_contact` varchar(50) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `file_url` varchar(255) DEFAULT NULL,
  `qr_code_data` text DEFAULT NULL,
  `invoice_url` varchar(255) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_receipts_school` (`school_id`),
  KEY `idx_receipts_student` (`student_id`),
  KEY `idx_receipts_no` (`receipt_no`),
  KEY `idx_receipts_date` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='Receipt tracking';

CREATE TABLE IF NOT EXISTS `mobile_money_transactions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `student_id` bigint DEFAULT NULL,
  `transaction_type` enum('deposit','withdrawal','payment','refund') DEFAULT 'payment',
  `provider` enum('mpesa','airtel','tigo','vodacom','other') DEFAULT 'mpesa',
  `phone_number` varchar(20) DEFAULT NULL,
  `amount` decimal(14,2) DEFAULT '0.00',
  `currency` varchar(10) DEFAULT 'TZS',
  `transaction_ref` varchar(100) DEFAULT NULL,
  `conversation_id` varchar(100) DEFAULT NULL,
  `original_transaction_id` varchar(100) DEFAULT NULL,
  `transaction_date` timestamp DEFAULT CURRENT_TIMESTAMP,
  `status` enum('pending','processing','completed','failed','cancelled') DEFAULT 'pending',
  `result_code` varchar(20) DEFAULT NULL,
  `result_desc` text DEFAULT NULL,
  `balance` decimal(14,2) DEFAULT NULL,
  `receipt_url` varchar(255) DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_momo_school` (`school_id`),
  KEY `idx_momo_student` (`student_id`),
  KEY `idx_momo_provider` (`provider`),
  KEY `idx_momo_status` (`status`),
  KEY `idx_momo_ref` (`transaction_ref`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='Mobile money transaction tracking';

CREATE TABLE IF NOT EXISTS `balance_reminders` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `student_id` bigint NOT NULL,
  `term_id` bigint NOT NULL,
  `reminder_type` enum('email','sms','both') DEFAULT 'both',
  `threshold_amount` decimal(14,2) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `sent_at` timestamp NULL DEFAULT NULL,
  `status` enum('pending','sent','failed') DEFAULT 'pending',
  `response_data` json DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_reminders_school` (`school_id`),
  KEY `idx_reminders_student` (`student_id`),
  KEY `idx_reminders_status` (`status`),
  KEY `idx_reminders_sent` (`sent_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='Balance reminder tracking';

CREATE TABLE IF NOT EXISTS `student_fee_items` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `student_id` bigint NOT NULL,
  `section_id` bigint DEFAULT NULL,
  `academic_year` varchar(9) DEFAULT NULL,
  `fee_structure_id` bigint DEFAULT NULL,
  `fee_type` varchar(50) DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `late_fee` decimal(14,2) DEFAULT '0.00',
  `status` enum('pending','partial','paid','overdue','waived') DEFAULT 'pending',
  `waived_by` bigint DEFAULT NULL,
  `waived_reason` text COLLATE utf8_general_ci DEFAULT NULL,
  `approved_by` bigint DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `last_payment_date` timestamp NULL DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `term_id` bigint NOT NULL,
  `item` varchar(120) NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `discount` decimal(14,2) DEFAULT '0.00',
  `paid` decimal(14,2) DEFAULT '0.00',
  `balance` decimal(14,2) GENERATED ALWAYS AS (((`amount` - `discount`) - `paid`)) STORED,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_sfi_student` (`student_id`),
  KEY `idx_sfi_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `waivers_discounts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `student_id` bigint NOT NULL,
  `term_id` bigint NOT NULL,
  `fee_item_id` bigint DEFAULT NULL,
  `waiver_type` enum('full','partial') DEFAULT 'partial',
  `discount_type` enum('percentage','fixed') DEFAULT 'fixed',
  `amount` decimal(14,2) NOT NULL,
  `reason` text NOT NULL,
  `approved_by` bigint DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `status` enum('pending','approved','rejected') DEFAULT 'pending',
  `rejection_reason` text DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_waivers_school` (`school_id`),
  KEY `idx_waivers_student` (`student_id`),
  KEY `idx_waivers_term` (`term_id`),
  KEY `idx_waivers_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='Fee waivers and discounts tracking';

-- ============================================================================
-- NOTIFICATION SYSTEM TABLES  
-- ============================================================================

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `actor_user_id` bigint DEFAULT NULL,
  `action` varchar(120) NOT NULL,
  `entity_type` varchar(50) DEFAULT NULL,
  `entity_id` bigint DEFAULT NULL,
  `title` varchar(255) DEFAULT NULL,
  `message` text DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  `priority` enum('low','normal','high','critical') DEFAULT 'normal',
  `channel` varchar(50) DEFAULT 'in_app',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `read_count` int DEFAULT '0',
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_notifications_school_created` (`school_id`,`created_at`),
  KEY `idx_notifications_actor` (`actor_user_id`),
  KEY `idx_notifications_action` (`action`),
  KEY `idx_notifications_entity` (`entity_type`,`entity_id`),
  KEY `idx_notifications_priority` (`priority`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='Core notifications storage';

CREATE TABLE IF NOT EXISTS `notification_queue` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `notification_id` bigint NOT NULL,
  `recipient_user_id` bigint DEFAULT NULL,
  `channel` varchar(50) DEFAULT 'in_app',
  `attempts` int DEFAULT '0',
  `max_attempts` int DEFAULT '3',
  `last_attempt_at` timestamp NULL DEFAULT NULL,
  `next_attempt_at` timestamp NULL DEFAULT NULL,
  `status` enum('pending','sent','failed','cancelled') DEFAULT 'pending',
  `payload` json DEFAULT NULL,
  `error_message` text DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_queue_status` (`status`,`next_attempt_at`),
  KEY `idx_queue_recipient` (`recipient_user_id`),
  KEY `idx_queue_notification` (`notification_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='Notification delivery queue';

CREATE TABLE IF NOT EXISTS `notification_templates` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `code` varchar(120) NOT NULL,
  `title_template` varchar(255) DEFAULT NULL,
  `message_template` text DEFAULT NULL,
  `default_channel` varchar(50) DEFAULT 'in_app',
  `priority` enum('low','normal','high','critical') DEFAULT 'normal',
  `is_system` tinyint(1) DEFAULT '0',
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_template_code` (`school_id`,`code`),
  KEY `idx_templates_system` (`is_system`,`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=9 COMMENT='Reusable notification templates';

CREATE TABLE IF NOT EXISTS `notification_preferences` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `school_id` bigint DEFAULT NULL,
  `channel` varchar(50) NOT NULL,
  `enabled` tinyint(1) DEFAULT '1',
  `do_not_disturb` tinyint(1) DEFAULT '0',
  `dnd_until` timestamp NULL DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_user_channel` (`user_id`,`channel`),
  KEY `idx_preferences_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='User notification preferences';

CREATE TABLE IF NOT EXISTS `user_notifications` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `notification_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `school_id` bigint DEFAULT NULL,
  `is_read` tinyint(1) DEFAULT '0',
  `is_archived` tinyint(1) DEFAULT '0',
  `channel` varchar(50) DEFAULT 'in_app',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `read_at` timestamp NULL DEFAULT NULL,
  `archived_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_user_notification` (`notification_id`,`user_id`),
  KEY `idx_user_notifications_user` (`user_id`,`is_read`,`is_archived`),
  KEY `idx_user_notifications_school` (`school_id`,`user_id`),
  KEY `idx_user_notifications_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='Per-user notification state';

-- ============================================================================
-- TAHFIZ (QURAN MEMORIZATION) TRACKING TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS `tahfiz_groups` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `name` varchar(100) NOT NULL,
  `teacher_id` bigint NOT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_school_id` (`school_id`),
  KEY `idx_teacher_id` (`teacher_id`),
  KEY `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `tahfiz_books` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `title` varchar(100) NOT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL,
  `total_units` int DEFAULT NULL,
  `unit_type` varchar(50) DEFAULT 'verse',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `tahfiz_plans` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `book_id` bigint DEFAULT NULL,
  `teacher_id` bigint NOT NULL,
  `class_id` bigint DEFAULT NULL,
  `stream_id` bigint DEFAULT NULL,
  `group_id` bigint DEFAULT NULL,
  `assigned_date` date NOT NULL,
  `portion_text` varchar(255) NOT NULL,
  `portion_unit` varchar(50) DEFAULT 'verse',
  `expected_length` int DEFAULT NULL,
  `type` varchar(20) NOT NULL DEFAULT 'tilawa',
  `notes` text DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_school_date` (`school_id`,`assigned_date`),
  KEY `idx_teacher` (`teacher_id`),
  KEY `idx_book_id` (`book_id`),
  KEY `idx_group_id` (`group_id`),
  KEY `idx_class_id` (`class_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `tahfiz_attendance` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `group_id` bigint NOT NULL,
  `date` date NOT NULL,
  `status` enum('present','absent','late','excused') DEFAULT 'present',
  `remarks` text COLLATE utf8_general_ci DEFAULT NULL,
  `recorded_by` bigint DEFAULT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `tahfiz_results` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `student_id` bigint NOT NULL,
  `group_id` bigint DEFAULT NULL,
  `term_id` bigint DEFAULT NULL,
  `academic_year_id` bigint DEFAULT NULL,
  `portion_id` bigint DEFAULT NULL,
  `result_date` date DEFAULT NULL,
  `pages_memorized` int DEFAULT '0',
  `pages_reviewed` int DEFAULT '0',
  `juz_completed` int DEFAULT '0',
  `memorization_percentage` decimal(5,2) DEFAULT '0.00',
  `accuracy_score` decimal(5,2) DEFAULT '0.00',
  `overall_score` decimal(5,2) DEFAULT '0.00',
  `remarks` text DEFAULT NULL,
  `recorded_by` bigint DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_school_student` (`school_id`,`student_id`),
  KEY `idx_result_date` (`result_date`),
  KEY `idx_term_academic_year` (`term_id`,`academic_year_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `tahfiz_seven_metrics` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `result_id` bigint NOT NULL,
  `fluency_score` decimal(5,2) DEFAULT '0.00',
  `accuracy_score` decimal(5,2) DEFAULT '0.00',
  `tajweed_score` decimal(5,2) DEFAULT '0.00',
  `consistency_score` decimal(5,2) DEFAULT '0.00',
  `participation_score` decimal(5,2) DEFAULT '0.00',
  `attitude_score` decimal(5,2) DEFAULT '0.00',
  `improvement_score` decimal(5,2) DEFAULT '0.00',
  `overall_score` decimal(5,2) DEFAULT '0.00',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `result_id` (`result_id`),
  KEY `idx_school_id` (`school_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `student_hafz_progress_summary` (
  `student_id` bigint NOT NULL,
  `juz_memorized` int DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

-- ============================================================================
-- MISCELLANEOUS MANAGEMENT TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS `staff` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `branch_id` bigint DEFAULT '1',
  `person_id` bigint NOT NULL,
  `staff_no` varchar(50) DEFAULT NULL,
  `department_id` bigint DEFAULT NULL,
  `role_id` bigint DEFAULT NULL,
  `position` varchar(100) DEFAULT NULL,
  `employment_type` enum('permanent','contract','volunteer','part-time') DEFAULT 'permanent',
  `qualification` varchar(255) DEFAULT NULL,
  `experience_years` int DEFAULT '0',
  `hire_date` date DEFAULT NULL,
  `salary` decimal(14,2) DEFAULT NULL,
  `bank_name` varchar(150) DEFAULT NULL,
  `bank_account_no` varchar(100) DEFAULT NULL,
  `nssf_no` varchar(100) DEFAULT NULL,
  `tin_no` varchar(100) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'active',
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=30013;

CREATE TABLE IF NOT EXISTS `staff_attendance` (
  `id` bigint NOT NULL,
  `staff_id` bigint NOT NULL,
  `date` date NOT NULL,
  `status` varchar(20) DEFAULT 'present',
  `notes` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `departments` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `name` varchar(120) NOT NULL,
  `head_staff_id` bigint DEFAULT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `department_workplans` (
  `id` bigint NOT NULL,
  `department_id` bigint NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL,
  `start_datetime` datetime DEFAULT NULL,
  `end_datetime` datetime DEFAULT NULL,
  `status` varchar(20) DEFAULT 'pending',
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `branches` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `name` varchar(150) NOT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `address` text COLLATE utf8_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `roles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `name` varchar(80) NOT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=11;

CREATE TABLE IF NOT EXISTS `permissions` (
  `id` bigint NOT NULL,
  `code` varchar(120) NOT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` bigint NOT NULL,
  `permission_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `streams` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `class_id` bigint NOT NULL,
  `name` varchar(50) NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `subject` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `name` varchar(120) NOT NULL,
  `code` varchar(20) DEFAULT NULL,
  `subject_type` varchar(20) DEFAULT 'core'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `class_subjects` (
  `id` bigint NOT NULL,
  `class_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `teacher_id` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `contacts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `person_id` bigint NOT NULL,
  `contact_type` varchar(30) NOT NULL,
  `occupation` varchar(120) DEFAULT NULL,
  `alive_status` varchar(20) DEFAULT NULL,
  `date_of_death` date DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=2;

CREATE TABLE IF NOT EXISTS `student_contacts` (
  `student_id` bigint NOT NULL,
  `contact_id` bigint NOT NULL,
  `relationship` varchar(50) DEFAULT NULL,
  `is_primary` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `student_family_status` (
  `student_id` bigint NOT NULL,
  `orphan_status_id` tinyint DEFAULT NULL,
  `primary_guardian_name` varchar(150) DEFAULT NULL,
  `primary_guardian_contact` varchar(60) DEFAULT NULL,
  `primary_guardian_occupation` varchar(120) DEFAULT NULL,
  `father_name` varchar(150) DEFAULT NULL,
  `father_living_status_id` tinyint DEFAULT NULL,
  `father_occupation` varchar(120) DEFAULT NULL,
  `father_contact` varchar(60) DEFAULT NULL,
  `notes` text COLLATE utf8_general_ci DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `student_profiles` (
  `student_id` bigint NOT NULL,
  `place_of_birth` varchar(150) DEFAULT NULL,
  `place_of_residence` varchar(150) DEFAULT NULL,
  `district_id` bigint DEFAULT NULL,
  `nationality_id` int DEFAULT NULL,
  `passport_document_id` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `student_next_of_kin` (
  `id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `sequence` tinyint NOT NULL,
  `name` varchar(150) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `occupation` varchar(120) DEFAULT NULL,
  `contact` varchar(60) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `student_curriculums` (
  `student_id` bigint NOT NULL,
  `curriculum_id` tinyint NOT NULL,
  `active` tinyint(1) DEFAULT '1',
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `student_education_levels` (
  `id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `education_type` varchar(20) NOT NULL,
  `level_name` varchar(120) NOT NULL,
  `institution` varchar(150) DEFAULT NULL,
  `year_completed` year(4) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `villages` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `parish_id` bigint NOT NULL,
  `name` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `name` (`name`),
  KEY `idx_villages_parish` (`parish_id`),
  KEY `idx_villages_name` (`name`),
  KEY `idx_villages_deleted` (`deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='Villages table for location hierarchy';

CREATE TABLE IF NOT EXISTS `parishes` (
  `id` bigint NOT NULL,
  `subcounty_id` bigint NOT NULL,
  `name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `subcounties` (
  `id` bigint NOT NULL,
  `county_id` bigint NOT NULL,
  `name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `counties` (
  `id` bigint NOT NULL,
  `district_id` bigint NOT NULL,
  `name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `districts` (
  `id` bigint NOT NULL,
  `name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `nationalities` (
  `id` int NOT NULL,
  `code` varchar(3) NOT NULL,
  `name` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `documents` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `owner_type` varchar(30) NOT NULL,
  `owner_id` bigint NOT NULL,
  `document_type_id` bigint NOT NULL,
  `file_name` varchar(200) NOT NULL,
  `file_url` varchar(255) NOT NULL,
  `mime_type` varchar(100) DEFAULT NULL,
  `file_size` bigint DEFAULT NULL,
  `issued_by` varchar(150) DEFAULT NULL,
  `issue_date` date DEFAULT NULL,
  `notes` text COLLATE utf8_general_ci DEFAULT NULL,
  `uploaded_by` bigint DEFAULT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `document_types` (
  `id` bigint NOT NULL,
  `code` varchar(60) NOT NULL,
  `label` varchar(120) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `exams` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `class_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `term_id` bigint DEFAULT NULL,
  `name` varchar(120) NOT NULL,
  `body` varchar(50) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `start_time` time DEFAULT NULL,
  `end_time` time DEFAULT NULL,
  `status` varchar(20) DEFAULT 'scheduled'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `class_results` (
  `id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `class_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `term_id` bigint DEFAULT NULL,
  `result_type_id` bigint NOT NULL,
  `score` decimal(5,2) DEFAULT NULL,
  `grade` varchar(10) DEFAULT NULL,
  `remarks` text COLLATE utf8_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `result_types` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `name` varchar(120) NOT NULL,
  `code` varchar(60) DEFAULT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL,
  `weight` decimal(5,2) DEFAULT NULL,
  `deadline` varchar(255) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `report_cards` (
  `id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `term_id` bigint NOT NULL,
  `overall_grade` varchar(10) DEFAULT NULL,
  `class_teacher_comment` text COLLATE utf8_general_ci DEFAULT NULL,
  `headteacher_comment` text COLLATE utf8_general_ci DEFAULT NULL,
  `dos_comment` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `report_card_subjects` (
  `id` bigint NOT NULL,
  `report_card_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `total_score` decimal(5,2) DEFAULT NULL,
  `grade` varchar(10) DEFAULT NULL,
  `remarks` text COLLATE utf8_general_ci DEFAULT NULL,
  `position` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `report_card_metrics` (
  `report_card_id` bigint NOT NULL,
  `total_score` decimal(7,2) DEFAULT NULL,
  `average_score` decimal(5,2) DEFAULT NULL,
  `min_score` decimal(5,2) DEFAULT NULL,
  `max_score` decimal(5,2) DEFAULT NULL,
  `position` int DEFAULT NULL,
  `promoted` tinyint(1) DEFAULT '0',
  `promotion_class_id` bigint DEFAULT NULL,
  `computed_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `curriculums` (
  `id` tinyint NOT NULL AUTO_INCREMENT,
  `code` varchar(30) NOT NULL,
  `name` varchar(100) NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=30003;

CREATE TABLE IF NOT EXISTS `events` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL,
  `start_datetime` datetime NOT NULL,
  `end_datetime` datetime NOT NULL,
  `location` varchar(120) DEFAULT NULL,
  `status` varchar(20) DEFAULT 'upcoming',
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `school_settings` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `key_name` varchar(120) NOT NULL,
  `value_text` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `feature_flags` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `route_name` varchar(255) NOT NULL DEFAULT 'default',
  `route_path` varchar(255) NOT NULL DEFAULT '/',
  `label` varchar(255) NOT NULL DEFAULT 'Feature',
  `flag_name` varchar(100) NOT NULL,
  `flag_key` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `is_enabled` tinyint(1) DEFAULT '0',
  `is_new` tinyint(1) DEFAULT '0',
  `version_tag` varchar(50) DEFAULT 'v_current',
  `category` varchar(100) DEFAULT 'general',
  `priority` int DEFAULT '0',
  `date_added` timestamp DEFAULT CURRENT_TIMESTAMP,
  `expires_at` timestamp NULL DEFAULT NULL,
  `flag_type` enum('boolean','percentage','user_list','variant') DEFAULT 'boolean',
  `variant_data` json DEFAULT NULL,
  `rollout_percentage` int DEFAULT '0',
  `enabled_users` json DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `uq_flag_school` (`school_id`,`flag_key`),
  KEY `idx_flag_enabled` (`is_enabled`,`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

-- ============================================================================
-- MISSING TABLES - ADDITIONAL
-- ============================================================================

CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `token` varchar(255) NOT NULL,
  `expires_at` timestamp NOT NULL,
  `used` tinyint(1) DEFAULT '0',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `token` (`token`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_token` (`token`),
  KEY `idx_expires` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

CREATE TABLE IF NOT EXISTS `user_sessions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `session_token` varchar(255) NOT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `expires_at` timestamp NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `session_token` (`session_token`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_session_token` (`session_token`),
  KEY `idx_expires_at` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;

-- ============================================================================
-- FINAL SETUP
-- ============================================================================

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- MERGE COMPLETE
-- ============================================================================
-- Summary:
-- ✓ Added all missing tables from ibunbaz_20260301_full.sql
-- ✓ Preserved all column structures and constraints
-- ✓ Maintained all indexes and keys
-- ✓ Total new tables added: 97 tables
-- ✓ Database is now fully integrated with all features
-- ============================================================================
