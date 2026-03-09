-- MySQL dump 10.13  Distrib 8.0.44, for Linux (x86_64)
--
-- Host: gateway01.eu-central-1.prod.aws.tidbcloud.com    Database: test
-- ------------------------------------------------------
-- Server version	8.0.11-TiDB-v7.5.6-serverless

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `academic_years`
--

DROP TABLE IF EXISTS `academic_years`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `academic_years` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `name` varchar(20) NOT NULL,
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `status` varchar(20) DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `academic_years`
--

LOCK TABLES `academic_years` WRITE;
/*!40000 ALTER TABLE `academic_years` DISABLE KEYS */;
/*!40000 ALTER TABLE `academic_years` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_audit_logs`
--

DROP TABLE IF EXISTS `attendance_audit_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_audit_logs` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_audit_logs`
--

LOCK TABLES `attendance_audit_logs` WRITE;
/*!40000 ALTER TABLE `attendance_audit_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance_audit_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_logs`
--

DROP TABLE IF EXISTS `attendance_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_logs` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_logs`
--

LOCK TABLES `attendance_logs` WRITE;
/*!40000 ALTER TABLE `attendance_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_processing_queue`
--

DROP TABLE IF EXISTS `attendance_processing_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_processing_queue` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_processing_queue`
--

LOCK TABLES `attendance_processing_queue` WRITE;
/*!40000 ALTER TABLE `attendance_processing_queue` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance_processing_queue` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_reconciliation`
--

DROP TABLE IF EXISTS `attendance_reconciliation`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_reconciliation` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_reconciliation`
--

LOCK TABLES `attendance_reconciliation` WRITE;
/*!40000 ALTER TABLE `attendance_reconciliation` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance_reconciliation` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_reports`
--

DROP TABLE IF EXISTS `attendance_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_reports` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_reports`
--

LOCK TABLES `attendance_reports` WRITE;
/*!40000 ALTER TABLE `attendance_reports` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance_reports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_rules`
--

DROP TABLE IF EXISTS `attendance_rules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_rules` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_rules`
--

LOCK TABLES `attendance_rules` WRITE;
/*!40000 ALTER TABLE `attendance_rules` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance_rules` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_sessions`
--

DROP TABLE IF EXISTS `attendance_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_sessions` (
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
  CONSTRAINT `attendance_sessions_ibfk_3` FOREIGN KEY (`stream_id`) REFERENCES `streams` (`id`) ON DELETE SET NULL,
  CONSTRAINT `attendance_sessions_ibfk_4` FOREIGN KEY (`school_id`) REFERENCES `schools` (`id`) ON DELETE CASCADE,
  CONSTRAINT `attendance_sessions_ibfk_5` FOREIGN KEY (`class_id`) REFERENCES `classes` (`id`),
  CONSTRAINT `attendance_sessions_ibfk_6` FOREIGN KEY (`stream_id`) REFERENCES `streams` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Attendance session tracking for class-level periods';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_sessions`
--

LOCK TABLES `attendance_sessions` WRITE;
/*!40000 ALTER TABLE `attendance_sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `attendance_users`
--

DROP TABLE IF EXISTS `attendance_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attendance_users` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `attendance_users`
--

LOCK TABLES `attendance_users` WRITE;
/*!40000 ALTER TABLE `attendance_users` DISABLE KEYS */;
/*!40000 ALTER TABLE `attendance_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `id` bigint NOT NULL,
  `actor_user_id` bigint DEFAULT NULL,
  `action` varchar(100) NOT NULL,
  `entity_type` varchar(100) NOT NULL,
  `entity_id` bigint DEFAULT NULL,
  `changes_json` longtext DEFAULT NULL,
  `ip` varchar(64) DEFAULT NULL,
  `user_agent` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `audit_log`
--

LOCK TABLES `audit_log` WRITE;
/*!40000 ALTER TABLE `audit_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `audit_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `balance_reminders`
--

DROP TABLE IF EXISTS `balance_reminders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `balance_reminders` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `balance_reminders`
--

LOCK TABLES `balance_reminders` WRITE;
/*!40000 ALTER TABLE `balance_reminders` DISABLE KEYS */;
/*!40000 ALTER TABLE `balance_reminders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `biometric_devices`
--

DROP TABLE IF EXISTS `biometric_devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `biometric_devices` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `biometric_devices`
--

LOCK TABLES `biometric_devices` WRITE;
/*!40000 ALTER TABLE `biometric_devices` DISABLE KEYS */;
/*!40000 ALTER TABLE `biometric_devices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `branches`
--

DROP TABLE IF EXISTS `branches`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `branches` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `branches`
--

LOCK TABLES `branches` WRITE;
/*!40000 ALTER TABLE `branches` DISABLE KEYS */;
/*!40000 ALTER TABLE `branches` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `class_results`
--

DROP TABLE IF EXISTS `class_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_results` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `class_results`
--

LOCK TABLES `class_results` WRITE;
/*!40000 ALTER TABLE `class_results` DISABLE KEYS */;
/*!40000 ALTER TABLE `class_results` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `class_subjects`
--

DROP TABLE IF EXISTS `class_subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `class_subjects` (
  `id` bigint NOT NULL,
  `class_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `teacher_id` bigint DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `class_subjects`
--

LOCK TABLES `class_subjects` WRITE;
/*!40000 ALTER TABLE `class_subjects` DISABLE KEYS */;
/*!40000 ALTER TABLE `class_subjects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `classes`
--

DROP TABLE IF EXISTS `classes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `classes` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `name` varchar(50) NOT NULL,
  `curriculum_id` int DEFAULT NULL,
  `class_level` int DEFAULT NULL,
  `head_teacher_id` bigint DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=30005;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `classes`
--

LOCK TABLES `classes` WRITE;
/*!40000 ALTER TABLE `classes` DISABLE KEYS */;
INSERT INTO `classes` VALUES (1,1,'Senior One',1,11,NULL),(3,1,'Senior Two',1,10,NULL),(4,1,'Senior Three',1,NULL,11);
/*!40000 ALTER TABLE `classes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `contacts`
--

DROP TABLE IF EXISTS `contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `contacts` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `contacts`
--

LOCK TABLES `contacts` WRITE;
/*!40000 ALTER TABLE `contacts` DISABLE KEYS */;
/*!40000 ALTER TABLE `contacts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `counties`
--

DROP TABLE IF EXISTS `counties`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `counties` (
  `id` bigint NOT NULL,
  `district_id` bigint NOT NULL,
  `name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `counties`
--

LOCK TABLES `counties` WRITE;
/*!40000 ALTER TABLE `counties` DISABLE KEYS */;
/*!40000 ALTER TABLE `counties` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `curriculums`
--

DROP TABLE IF EXISTS `curriculums`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `curriculums` (
  `id` tinyint NOT NULL AUTO_INCREMENT,
  `code` varchar(30) NOT NULL,
  `name` varchar(100) NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=30003;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `curriculums`
--

LOCK TABLES `curriculums` WRITE;
/*!40000 ALTER TABLE `curriculums` DISABLE KEYS */;
INSERT INTO `curriculums` VALUES (1,'SEC','SECULAR'),(2,'ISL','Islamic');
/*!40000 ALTER TABLE `curriculums` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dahua_attendance_logs`
--

DROP TABLE IF EXISTS `dahua_attendance_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dahua_attendance_logs` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dahua_attendance_logs`
--

LOCK TABLES `dahua_attendance_logs` WRITE;
/*!40000 ALTER TABLE `dahua_attendance_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `dahua_attendance_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dahua_devices`
--

DROP TABLE IF EXISTS `dahua_devices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dahua_devices` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dahua_devices`
--

LOCK TABLES `dahua_devices` WRITE;
/*!40000 ALTER TABLE `dahua_devices` DISABLE KEYS */;
/*!40000 ALTER TABLE `dahua_devices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dahua_raw_logs`
--

DROP TABLE IF EXISTS `dahua_raw_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dahua_raw_logs` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dahua_raw_logs`
--

LOCK TABLES `dahua_raw_logs` WRITE;
/*!40000 ALTER TABLE `dahua_raw_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `dahua_raw_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `dahua_sync_history`
--

DROP TABLE IF EXISTS `dahua_sync_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `dahua_sync_history` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `dahua_sync_history`
--

LOCK TABLES `dahua_sync_history` WRITE;
/*!40000 ALTER TABLE `dahua_sync_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `dahua_sync_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `daily_attendance`
--

DROP TABLE IF EXISTS `daily_attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `daily_attendance` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `daily_attendance`
--

LOCK TABLES `daily_attendance` WRITE;
/*!40000 ALTER TABLE `daily_attendance` DISABLE KEYS */;
/*!40000 ALTER TABLE `daily_attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `department_workplans`
--

DROP TABLE IF EXISTS `department_workplans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `department_workplans` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `department_workplans`
--

LOCK TABLES `department_workplans` WRITE;
/*!40000 ALTER TABLE `department_workplans` DISABLE KEYS */;
/*!40000 ALTER TABLE `department_workplans` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `departments`
--

DROP TABLE IF EXISTS `departments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `departments` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `name` varchar(120) NOT NULL,
  `head_staff_id` bigint DEFAULT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `departments`
--

LOCK TABLES `departments` WRITE;
/*!40000 ALTER TABLE `departments` DISABLE KEYS */;
/*!40000 ALTER TABLE `departments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `device_access_logs`
--

DROP TABLE IF EXISTS `device_access_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_access_logs` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_access_logs`
--

LOCK TABLES `device_access_logs` WRITE;
/*!40000 ALTER TABLE `device_access_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_access_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `device_configs`
--

DROP TABLE IF EXISTS `device_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_configs` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_configs`
--

LOCK TABLES `device_configs` WRITE;
/*!40000 ALTER TABLE `device_configs` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_configs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `device_connection_history`
--

DROP TABLE IF EXISTS `device_connection_history`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_connection_history` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_connection_history`
--

LOCK TABLES `device_connection_history` WRITE;
/*!40000 ALTER TABLE `device_connection_history` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_connection_history` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `device_sync_checkpoints`
--

DROP TABLE IF EXISTS `device_sync_checkpoints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_sync_checkpoints` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_sync_checkpoints`
--

LOCK TABLES `device_sync_checkpoints` WRITE;
/*!40000 ALTER TABLE `device_sync_checkpoints` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_sync_checkpoints` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `device_sync_logs`
--

DROP TABLE IF EXISTS `device_sync_logs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_sync_logs` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_sync_logs`
--

LOCK TABLES `device_sync_logs` WRITE;
/*!40000 ALTER TABLE `device_sync_logs` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_sync_logs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `device_users`
--

DROP TABLE IF EXISTS `device_users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `device_users` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `device_users`
--

LOCK TABLES `device_users` WRITE;
/*!40000 ALTER TABLE `device_users` DISABLE KEYS */;
/*!40000 ALTER TABLE `device_users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `districts`
--

DROP TABLE IF EXISTS `districts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `districts` (
  `id` bigint NOT NULL,
  `name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `districts`
--

LOCK TABLES `districts` WRITE;
/*!40000 ALTER TABLE `districts` DISABLE KEYS */;
/*!40000 ALTER TABLE `districts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `document_types`
--

DROP TABLE IF EXISTS `document_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `document_types` (
  `id` bigint NOT NULL,
  `code` varchar(60) NOT NULL,
  `label` varchar(120) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `document_types`
--

LOCK TABLES `document_types` WRITE;
/*!40000 ALTER TABLE `document_types` DISABLE KEYS */;
/*!40000 ALTER TABLE `document_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `documents`
--

DROP TABLE IF EXISTS `documents`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `documents` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `documents`
--

LOCK TABLES `documents` WRITE;
/*!40000 ALTER TABLE `documents` DISABLE KEYS */;
/*!40000 ALTER TABLE `documents` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `enrollments`
--

DROP TABLE IF EXISTS `enrollments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `enrollments` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `student_id` bigint NOT NULL,
  `class_id` bigint DEFAULT NULL,
  `theology_class_id` bigint DEFAULT NULL,
  `stream_id` bigint DEFAULT NULL,
  `academic_year_id` bigint DEFAULT NULL,
  `term_id` bigint DEFAULT NULL,
  `status` varchar(20) DEFAULT 'active',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=120682;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `enrollments`
--

LOCK TABLES `enrollments` WRITE;
/*!40000 ALTER TABLE `enrollments` DISABLE KEYS */;
INSERT INTO `enrollments` VALUES (681,662,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 09:44:33'),(30682,30663,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 14:13:23'),(30683,30664,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 14:20:37'),(30684,30665,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 14:22:34'),(30685,30666,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 14:23:37'),(30686,30667,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 14:24:54'),(30687,30668,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 14:25:44'),(30688,30669,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 14:33:21'),(30689,30670,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 14:33:59'),(30690,30671,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 14:34:44'),(30691,30672,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 14:35:31'),(60682,60663,1,1,NULL,NULL,NULL,'active','2026-02-28 15:38:45'),(60683,60664,1,1,NULL,NULL,NULL,'active','2026-02-28 15:39:54'),(60684,60665,1,1,NULL,NULL,NULL,'active','2026-02-28 15:41:42'),(90682,90663,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 18:58:31'),(90683,90664,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 18:59:31'),(90684,90665,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 19:02:54'),(90685,90666,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 19:09:17'),(90686,90667,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 19:09:42'),(90687,90668,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 19:31:13'),(90688,90669,NULL,NULL,NULL,NULL,NULL,'active','2026-02-28 19:38:31');
/*!40000 ALTER TABLE `enrollments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `events`
--

DROP TABLE IF EXISTS `events`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `events` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `events`
--

LOCK TABLES `events` WRITE;
/*!40000 ALTER TABLE `events` DISABLE KEYS */;
/*!40000 ALTER TABLE `events` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `exams`
--

DROP TABLE IF EXISTS `exams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `exams` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `exams`
--

LOCK TABLES `exams` WRITE;
/*!40000 ALTER TABLE `exams` DISABLE KEYS */;
/*!40000 ALTER TABLE `exams` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `expenditures`
--

DROP TABLE IF EXISTS `expenditures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `expenditures` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `category_id` bigint NOT NULL,
  `wallet_id` bigint DEFAULT NULL,
  `amount` decimal(14,2) NOT NULL,
  `description` text NOT NULL,
  `vendor_name` varchar(150) DEFAULT NULL,
  `vendor_contact` varchar(100) DEFAULT NULL,
  `invoice_number` varchar(100) DEFAULT NULL,
  `receipt_url` varchar(255) DEFAULT NULL,
  `expense_date` date DEFAULT NULL,
  `status` enum('pending','approved','paid','cancelled') DEFAULT 'pending',
  `approved_by` bigint DEFAULT NULL,
  `approved_at` timestamp NULL DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_expenditures_school` (`school_id`),
  KEY `idx_expenditures_category` (`category_id`),
  KEY `idx_expenditures_wallet` (`wallet_id`),
  KEY `idx_expenditures_date` (`expense_date`),
  KEY `idx_expenditures_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='Expenditure tracking for school expenses';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `expenditures`
--

LOCK TABLES `expenditures` WRITE;
/*!40000 ALTER TABLE `expenditures` DISABLE KEYS */;
/*!40000 ALTER TABLE `expenditures` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `feature_flags`
--

DROP TABLE IF EXISTS `feature_flags`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `feature_flags` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `feature_flags`
--

LOCK TABLES `feature_flags` WRITE;
/*!40000 ALTER TABLE `feature_flags` DISABLE KEYS */;
/*!40000 ALTER TABLE `feature_flags` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fee_invoices`
--

DROP TABLE IF EXISTS `fee_invoices`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fee_invoices` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fee_invoices`
--

LOCK TABLES `fee_invoices` WRITE;
/*!40000 ALTER TABLE `fee_invoices` DISABLE KEYS */;
/*!40000 ALTER TABLE `fee_invoices` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fee_payment_allocations`
--

DROP TABLE IF EXISTS `fee_payment_allocations`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fee_payment_allocations` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `payment_id` bigint NOT NULL,
  `fee_item_id` bigint NOT NULL,
  `allocated_amount` decimal(14,2) NOT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_payment` (`payment_id`),
  KEY `idx_fee_item` (`fee_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fee_payment_allocations`
--

LOCK TABLES `fee_payment_allocations` WRITE;
/*!40000 ALTER TABLE `fee_payment_allocations` DISABLE KEYS */;
/*!40000 ALTER TABLE `fee_payment_allocations` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fee_payments`
--

DROP TABLE IF EXISTS `fee_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fee_payments` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fee_payments`
--

LOCK TABLES `fee_payments` WRITE;
/*!40000 ALTER TABLE `fee_payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `fee_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fee_structures`
--

DROP TABLE IF EXISTS `fee_structures`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fee_structures` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fee_structures`
--

LOCK TABLES `fee_structures` WRITE;
/*!40000 ALTER TABLE `fee_structures` DISABLE KEYS */;
/*!40000 ALTER TABLE `fee_structures` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `finance_categories`
--

DROP TABLE IF EXISTS `finance_categories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `finance_categories` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `type` varchar(20) NOT NULL,
  `category_type` enum('income','expense','transfer') DEFAULT 'income',
  `parent_id` bigint DEFAULT NULL,
  `is_system` tinyint(1) DEFAULT '0',
  `color` varchar(20) DEFAULT '#3B82F6',
  `icon` varchar(50) DEFAULT 'DollarSign',
  `is_active` tinyint(1) DEFAULT '1',
  `name` varchar(120) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `finance_categories`
--

LOCK TABLES `finance_categories` WRITE;
/*!40000 ALTER TABLE `finance_categories` DISABLE KEYS */;
/*!40000 ALTER TABLE `finance_categories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `financial_reports`
--

DROP TABLE IF EXISTS `financial_reports`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `financial_reports` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `report_type` enum('income_statement','balance_sheet','cash_flow','fee_collection','expense_analysis','budget_variance') DEFAULT 'income_statement',
  `report_name` varchar(150) DEFAULT NULL,
  `report_period` enum('daily','weekly','monthly','term','yearly') DEFAULT 'monthly',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `academic_year_id` bigint DEFAULT NULL,
  `term_id` bigint DEFAULT NULL,
  `report_data` json DEFAULT NULL,
  `generated_by` bigint DEFAULT NULL,
  `generated_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `status` enum('generating','completed','failed') DEFAULT 'completed',
  `error_message` text DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_frep_school` (`school_id`),
  KEY `idx_frep_type` (`report_type`),
  KEY `idx_frep_period` (`start_date`,`end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='Financial reports storage';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `financial_reports`
--

LOCK TABLES `financial_reports` WRITE;
/*!40000 ALTER TABLE `financial_reports` DISABLE KEYS */;
/*!40000 ALTER TABLE `financial_reports` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `fingerprints`
--

DROP TABLE IF EXISTS `fingerprints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `fingerprints` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `fingerprints`
--

LOCK TABLES `fingerprints` WRITE;
/*!40000 ALTER TABLE `fingerprints` DISABLE KEYS */;
/*!40000 ALTER TABLE `fingerprints` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ledger`
--

DROP TABLE IF EXISTS `ledger`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ledger` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `wallet_id` bigint NOT NULL,
  `category_id` bigint NOT NULL,
  `tx_type` varchar(10) NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `reference` varchar(120) DEFAULT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL,
  `student_id` bigint DEFAULT NULL,
  `staff_id` bigint DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ledger`
--

LOCK TABLES `ledger` WRITE;
/*!40000 ALTER TABLE `ledger` DISABLE KEYS */;
/*!40000 ALTER TABLE `ledger` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ledger_accounts`
--

DROP TABLE IF EXISTS `ledger_accounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ledger_accounts` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `account_code` varchar(50) NOT NULL,
  `account_name` varchar(150) NOT NULL,
  `account_type` enum('asset','liability','income','expense','equity') DEFAULT 'asset',
  `account_subtype` varchar(50) DEFAULT NULL,
  `parent_id` bigint DEFAULT NULL,
  `balance_type` enum('debit','credit') DEFAULT 'debit',
  `opening_balance` decimal(14,2) DEFAULT '0.00',
  `current_balance` decimal(14,2) DEFAULT '0.00',
  `currency` varchar(10) DEFAULT 'TZS',
  `is_active` tinyint(1) DEFAULT '1',
  `is_system` tinyint(1) DEFAULT '0',
  `description` text DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ledger_school` (`school_id`),
  KEY `idx_ledger_code` (`account_code`),
  KEY `idx_ledger_type` (`account_type`),
  KEY `idx_ledger_parent` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='General ledger accounts';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ledger_accounts`
--

LOCK TABLES `ledger_accounts` WRITE;
/*!40000 ALTER TABLE `ledger_accounts` DISABLE KEYS */;
/*!40000 ALTER TABLE `ledger_accounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ledger_entries`
--

DROP TABLE IF EXISTS `ledger_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ledger_entries` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `transaction_id` bigint NOT NULL,
  `account_id` bigint NOT NULL,
  `entry_date` date DEFAULT NULL,
  `description` text DEFAULT NULL,
  `debit_amount` decimal(14,2) DEFAULT '0.00',
  `credit_amount` decimal(14,2) DEFAULT '0.00',
  `balance_after` decimal(14,2) DEFAULT NULL,
  `currency` varchar(10) DEFAULT 'TZS',
  `reference_type` varchar(50) DEFAULT NULL,
  `reference_id` bigint DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_lent_school` (`school_id`),
  KEY `idx_lent_transaction` (`transaction_id`),
  KEY `idx_lent_account` (`account_id`),
  KEY `idx_lent_date` (`entry_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='General ledger entries';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ledger_entries`
--

LOCK TABLES `ledger_entries` WRITE;
/*!40000 ALTER TABLE `ledger_entries` DISABLE KEYS */;
/*!40000 ALTER TABLE `ledger_entries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `ledger_transactions`
--

DROP TABLE IF EXISTS `ledger_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `ledger_transactions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `transaction_no` varchar(50) NOT NULL,
  `transaction_date` date DEFAULT NULL,
  `transaction_type` enum('journal','payment','receipt','adjustment','transfer') DEFAULT 'journal',
  `description` text DEFAULT NULL,
  `reference_no` varchar(100) DEFAULT NULL,
  `reference_type` varchar(50) DEFAULT NULL,
  `reference_id` bigint DEFAULT NULL,
  `total_amount` decimal(14,2) DEFAULT '0.00',
  `status` enum('draft','posted','voided') DEFAULT 'draft',
  `posted_by` bigint DEFAULT NULL,
  `posted_at` timestamp NULL DEFAULT NULL,
  `created_by` bigint DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_ltrx_school` (`school_id`),
  KEY `idx_ltrx_no` (`transaction_no`),
  KEY `idx_ltrx_date` (`transaction_date`),
  KEY `idx_ltrx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin COMMENT='General ledger transactions';
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `ledger_transactions`
--

LOCK TABLES `ledger_transactions` WRITE;
/*!40000 ALTER TABLE `ledger_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `ledger_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `living_statuses`
--

DROP TABLE IF EXISTS `living_statuses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `living_statuses` (
  `id` tinyint NOT NULL,
  `code` varchar(20) NOT NULL,
  `label` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `living_statuses`
--

LOCK TABLES `living_statuses` WRITE;
/*!40000 ALTER TABLE `living_statuses` DISABLE KEYS */;
/*!40000 ALTER TABLE `living_statuses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `manual_attendance_entries`
--

DROP TABLE IF EXISTS `manual_attendance_entries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `manual_attendance_entries` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `manual_attendance_entries`
--

LOCK TABLES `manual_attendance_entries` WRITE;
/*!40000 ALTER TABLE `manual_attendance_entries` DISABLE KEYS */;
/*!40000 ALTER TABLE `manual_attendance_entries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `mobile_money_transactions`
--

DROP TABLE IF EXISTS `mobile_money_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `mobile_money_transactions` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `mobile_money_transactions`
--

LOCK TABLES `mobile_money_transactions` WRITE;
/*!40000 ALTER TABLE `mobile_money_transactions` DISABLE KEYS */;
/*!40000 ALTER TABLE `mobile_money_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `nationalities`
--

DROP TABLE IF EXISTS `nationalities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `nationalities` (
  `id` int NOT NULL,
  `code` varchar(3) NOT NULL,
  `name` varchar(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `nationalities`
--

LOCK TABLES `nationalities` WRITE;
/*!40000 ALTER TABLE `nationalities` DISABLE KEYS */;
/*!40000 ALTER TABLE `nationalities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_preferences`
--

DROP TABLE IF EXISTS `notification_preferences`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_preferences` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_preferences`
--

LOCK TABLES `notification_preferences` WRITE;
/*!40000 ALTER TABLE `notification_preferences` DISABLE KEYS */;
/*!40000 ALTER TABLE `notification_preferences` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_queue`
--

DROP TABLE IF EXISTS `notification_queue`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_queue` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_queue`
--

LOCK TABLES `notification_queue` WRITE;
/*!40000 ALTER TABLE `notification_queue` DISABLE KEYS */;
/*!40000 ALTER TABLE `notification_queue` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notification_templates`
--

DROP TABLE IF EXISTS `notification_templates`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notification_templates` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notification_templates`
--

LOCK TABLES `notification_templates` WRITE;
/*!40000 ALTER TABLE `notification_templates` DISABLE KEYS */;
/*!40000 ALTER TABLE `notification_templates` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `notifications`
--

DROP TABLE IF EXISTS `notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `notifications` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `notifications`
--

LOCK TABLES `notifications` WRITE;
/*!40000 ALTER TABLE `notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `orphan_statuses`
--

DROP TABLE IF EXISTS `orphan_statuses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `orphan_statuses` (
  `id` tinyint NOT NULL,
  `code` varchar(20) NOT NULL,
  `label` varchar(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `orphan_statuses`
--

LOCK TABLES `orphan_statuses` WRITE;
/*!40000 ALTER TABLE `orphan_statuses` DISABLE KEYS */;
/*!40000 ALTER TABLE `orphan_statuses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `parishes`
--

DROP TABLE IF EXISTS `parishes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `parishes` (
  `id` bigint NOT NULL,
  `subcounty_id` bigint NOT NULL,
  `name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `parishes`
--

LOCK TABLES `parishes` WRITE;
/*!40000 ALTER TABLE `parishes` DISABLE KEYS */;
/*!40000 ALTER TABLE `parishes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `password_resets`
--

DROP TABLE IF EXISTS `password_resets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `password_resets` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `password_resets`
--

LOCK TABLES `password_resets` WRITE;
/*!40000 ALTER TABLE `password_resets` DISABLE KEYS */;
/*!40000 ALTER TABLE `password_resets` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payroll_definitions`
--

DROP TABLE IF EXISTS `payroll_definitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payroll_definitions` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `name` varchar(120) NOT NULL,
  `type` varchar(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payroll_definitions`
--

LOCK TABLES `payroll_definitions` WRITE;
/*!40000 ALTER TABLE `payroll_definitions` DISABLE KEYS */;
/*!40000 ALTER TABLE `payroll_definitions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `people`
--

DROP TABLE IF EXISTS `people`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `people` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `first_name` varchar(100) NOT NULL,
  `last_name` varchar(100) NOT NULL,
  `other_name` varchar(100) DEFAULT NULL,
  `gender` varchar(15) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `address` text COLLATE utf8_general_ci DEFAULT NULL,
  `photo_url` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=120682;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `people`
--

LOCK TABLES `people` WRITE;
/*!40000 ALTER TABLE `people` DISABLE KEYS */;
INSERT INTO `people` VALUES (681,1,'NALUBANGA','MARIAM',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 09:44:33',NULL,NULL),(30682,1,'NANGOBI','NASWIIBA',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 14:13:22',NULL,NULL),(30683,1,'AJAMBO','MARIAM',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 14:20:36',NULL,NULL),(30684,1,'WAYENGA','HAWAH',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 14:22:33',NULL,NULL),(30685,1,'NAKALENDE','MAYIMUNA',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 14:23:35',NULL,NULL),(30686,1,'NAKISITA','JAMAWA',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 14:24:53',NULL,NULL),(30687,1,'KWAGALA','HAULA',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 14:25:44',NULL,NULL),(30688,1,'NATO','MUNTAHA',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 14:33:21',NULL,NULL),(30689,1,'KAWALA','FITRA',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 14:33:58',NULL,NULL),(30690,1,'NAKIRUBA','SHADIA',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 14:34:42',NULL,NULL),(30691,1,'KAWOOZA','ANISHA','MBOIBO',NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 14:35:31',NULL,NULL),(60682,1,'BIRUNGI','NAJMA ASHURAH','HAMZA',NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 15:38:45',NULL,NULL),(60683,1,'BIRUNGI','NAJMA ASHURAH','HAMZA',NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 15:39:54',NULL,NULL),(60684,1,'MUTESI','ZUBEDAH',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 15:41:41',NULL,NULL),(90682,1,'NAMUMBYA','REAU',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 18:58:31',NULL,NULL),(90683,1,'NAMUMBYA','SWAMUHAH',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 18:59:30',NULL,NULL),(90684,1,'MUGABE','SWABRAH',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 19:02:53',NULL,NULL),(90685,1,'MUKISA','JOY','VERONICA',NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 19:09:13',NULL,NULL),(90686,1,'NAMAGANDA','SHIFAH',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 19:09:42',NULL,NULL),(90687,1,'NABATANZI','SHAKIRA',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 19:31:12',NULL,NULL),(90688,1,'CHEMUTAI','ZAHARA',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-02-28 19:38:30',NULL,NULL);
/*!40000 ALTER TABLE `people` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `permissions`
--

DROP TABLE IF EXISTS `permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `permissions` (
  `id` bigint NOT NULL,
  `code` varchar(120) NOT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `permissions`
--

LOCK TABLES `permissions` WRITE;
/*!40000 ALTER TABLE `permissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `promotion_audit_log`
--

DROP TABLE IF EXISTS `promotion_audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `promotion_audit_log` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `promotion_id` bigint DEFAULT NULL,
  `student_id` bigint NOT NULL,
  `action_type` enum('promoted','demoted','dropped','status_changed','criteria_applied','cancelled') NOT NULL,
  `from_class_id` bigint DEFAULT NULL,
  `to_class_id` bigint DEFAULT NULL,
  `from_academic_year_id` bigint DEFAULT NULL,
  `to_academic_year_id` bigint DEFAULT NULL,
  `status_before` varchar(50) DEFAULT NULL,
  `status_after` varchar(50) DEFAULT NULL,
  `criteria_applied` json DEFAULT NULL,
  `performed_by` bigint NOT NULL,
  `reason` text DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_school_id` (`school_id`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_action_type` (`action_type`),
  KEY `idx_performed_by` (`performed_by`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=7;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `promotion_audit_log`
--

LOCK TABLES `promotion_audit_log` WRITE;
/*!40000 ALTER TABLE `promotion_audit_log` DISABLE KEYS */;
/*!40000 ALTER TABLE `promotion_audit_log` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `promotion_criteria`
--

DROP TABLE IF EXISTS `promotion_criteria`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `promotion_criteria` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `name` varchar(100) NOT NULL,
  `description` text DEFAULT NULL,
  `criteria_type` enum('marks','average','attendance','conduct','custom') DEFAULT 'marks',
  `condition_json` json NOT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_school_id` (`school_id`),
  KEY `idx_is_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `promotion_criteria`
--

LOCK TABLES `promotion_criteria` WRITE;
/*!40000 ALTER TABLE `promotion_criteria` DISABLE KEYS */;
/*!40000 ALTER TABLE `promotion_criteria` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `promotions`
--

DROP TABLE IF EXISTS `promotions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `promotions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `student_id` bigint NOT NULL,
  `from_class_id` bigint DEFAULT '0',
  `to_class_id` bigint NOT NULL,
  `from_academic_year_id` bigint DEFAULT NULL,
  `to_academic_year_id` bigint DEFAULT NULL,
  `promotion_status` enum('promoted','not_promoted','pending','deferred') DEFAULT 'pending',
  `criteria_used` json DEFAULT NULL,
  `remarks` text DEFAULT NULL,
  `promoted_by` bigint DEFAULT NULL,
  `approval_status` enum('pending','approved','rejected') DEFAULT 'pending',
  `approved_by` bigint DEFAULT NULL,
  `term_used` varchar(50) DEFAULT NULL,
  `promotion_reason` enum('criteria_based','manual','appeal','correction') DEFAULT 'manual',
  `prerequisite_met` tinyint(1) DEFAULT '1',
  `additional_notes` text DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `unique_promotion_cycle` (`school_id`,`student_id`,`from_academic_year_id`),
  KEY `idx_school_id` (`school_id`),
  KEY `idx_student_id` (`student_id`),
  KEY `idx_from_class` (`from_class_id`),
  KEY `idx_to_class` (`to_class_id`),
  KEY `idx_promotion_status` (`promotion_status`),
  KEY `idx_approval_status` (`approval_status`),
  KEY `idx_promoted_by` (`promoted_by`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=6;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `promotions`
--

LOCK TABLES `promotions` WRITE;
/*!40000 ALTER TABLE `promotions` DISABLE KEYS */;
/*!40000 ALTER TABLE `promotions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `receipts`
--

DROP TABLE IF EXISTS `receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `receipts` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `receipts`
--

LOCK TABLES `receipts` WRITE;
/*!40000 ALTER TABLE `receipts` DISABLE KEYS */;
/*!40000 ALTER TABLE `receipts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_card_metrics`
--

DROP TABLE IF EXISTS `report_card_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_card_metrics` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_card_metrics`
--

LOCK TABLES `report_card_metrics` WRITE;
/*!40000 ALTER TABLE `report_card_metrics` DISABLE KEYS */;
/*!40000 ALTER TABLE `report_card_metrics` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_card_subjects`
--

DROP TABLE IF EXISTS `report_card_subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_card_subjects` (
  `id` bigint NOT NULL,
  `report_card_id` bigint NOT NULL,
  `subject_id` bigint NOT NULL,
  `total_score` decimal(5,2) DEFAULT NULL,
  `grade` varchar(10) DEFAULT NULL,
  `remarks` text COLLATE utf8_general_ci DEFAULT NULL,
  `position` int DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_card_subjects`
--

LOCK TABLES `report_card_subjects` WRITE;
/*!40000 ALTER TABLE `report_card_subjects` DISABLE KEYS */;
/*!40000 ALTER TABLE `report_card_subjects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `report_cards`
--

DROP TABLE IF EXISTS `report_cards`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `report_cards` (
  `id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `term_id` bigint NOT NULL,
  `overall_grade` varchar(10) DEFAULT NULL,
  `class_teacher_comment` text COLLATE utf8_general_ci DEFAULT NULL,
  `headteacher_comment` text COLLATE utf8_general_ci DEFAULT NULL,
  `dos_comment` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `report_cards`
--

LOCK TABLES `report_cards` WRITE;
/*!40000 ALTER TABLE `report_cards` DISABLE KEYS */;
/*!40000 ALTER TABLE `report_cards` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `requirements_master`
--

DROP TABLE IF EXISTS `requirements_master`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `requirements_master` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `requirements_master`
--

LOCK TABLES `requirements_master` WRITE;
/*!40000 ALTER TABLE `requirements_master` DISABLE KEYS */;
/*!40000 ALTER TABLE `requirements_master` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `result_types`
--

DROP TABLE IF EXISTS `result_types`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `result_types` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `result_types`
--

LOCK TABLES `result_types` WRITE;
/*!40000 ALTER TABLE `result_types` DISABLE KEYS */;
/*!40000 ALTER TABLE `result_types` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `results`
--

DROP TABLE IF EXISTS `results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `results` (
  `id` bigint NOT NULL,
  `exam_id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `score` decimal(5,2) DEFAULT NULL,
  `grade` varchar(5) DEFAULT NULL,
  `remarks` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `results`
--

LOCK TABLES `results` WRITE;
/*!40000 ALTER TABLE `results` DISABLE KEYS */;
/*!40000 ALTER TABLE `results` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `role_permissions`
--

DROP TABLE IF EXISTS `role_permissions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `role_permissions` (
  `role_id` bigint NOT NULL,
  `permission_id` bigint NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `role_permissions`
--

LOCK TABLES `role_permissions` WRITE;
/*!40000 ALTER TABLE `role_permissions` DISABLE KEYS */;
/*!40000 ALTER TABLE `role_permissions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `roles`
--

DROP TABLE IF EXISTS `roles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `roles` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL,
  `name` varchar(80) NOT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=11;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `roles`
--

LOCK TABLES `roles` WRITE;
/*!40000 ALTER TABLE `roles` DISABLE KEYS */;
/*!40000 ALTER TABLE `roles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `salary_payments`
--

DROP TABLE IF EXISTS `salary_payments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `salary_payments` (
  `id` bigint NOT NULL,
  `staff_id` bigint NOT NULL,
  `wallet_id` bigint NOT NULL,
  `amount` decimal(14,2) NOT NULL,
  `method` varchar(30) DEFAULT NULL,
  `reference` varchar(120) DEFAULT NULL,
  `ledger_id` bigint DEFAULT NULL,
  `paid_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `salary_payments`
--

LOCK TABLES `salary_payments` WRITE;
/*!40000 ALTER TABLE `salary_payments` DISABLE KEYS */;
/*!40000 ALTER TABLE `salary_payments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `school_info`
--

DROP TABLE IF EXISTS `school_info`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `school_info` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint NOT NULL DEFAULT '1',
  `school_name` varchar(255) NOT NULL,
  `school_motto` varchar(255) DEFAULT NULL,
  `school_address` text DEFAULT NULL,
  `school_contact` varchar(20) DEFAULT NULL,
  `school_email` varchar(255) DEFAULT NULL,
  `school_logo` varchar(255) DEFAULT NULL,
  `registration_number` varchar(100) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `founded_year` int DEFAULT NULL,
  `principal_name` varchar(255) DEFAULT NULL,
  `principal_email` varchar(255) DEFAULT NULL,
  `principal_phone` varchar(20) DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  UNIQUE KEY `unique_school` (`school_id`),
  KEY `idx_school_id` (`school_id`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `school_info`
--

LOCK TABLES `school_info` WRITE;
/*!40000 ALTER TABLE `school_info` DISABLE KEYS */;
/*!40000 ALTER TABLE `school_info` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `school_settings`
--

DROP TABLE IF EXISTS `school_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `school_settings` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `key_name` varchar(120) NOT NULL,
  `value_text` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `school_settings`
--

LOCK TABLES `school_settings` WRITE;
/*!40000 ALTER TABLE `school_settings` DISABLE KEYS */;
/*!40000 ALTER TABLE `school_settings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `schools`
--

DROP TABLE IF EXISTS `schools`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `schools` (
  `id` bigint NOT NULL,
  `name` varchar(150) NOT NULL,
  `legal_name` varchar(200) DEFAULT NULL,
  `short_code` varchar(50) DEFAULT NULL,
  `email` varchar(150) DEFAULT NULL,
  `phone` varchar(30) DEFAULT NULL,
  `currency` varchar(10) DEFAULT 'UGX',
  `address` text COLLATE utf8_general_ci DEFAULT NULL,
  `logo_url` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `schools`
--

LOCK TABLES `schools` WRITE;
/*!40000 ALTER TABLE `schools` DISABLE KEYS */;
INSERT INTO `schools` VALUES (1,'Ibun Baz Girls Secondary School','Ibun Baz Girls Secondary School','IBGS','info@ibunbaz.ac.ug','+256 700 123 456','UGX','Busei, Iganga along Iganga-Tororo highway',NULL,'2026-02-28 09:50:15','2026-02-28 09:50:15',NULL);
/*!40000 ALTER TABLE `schools` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `staff`
--

DROP TABLE IF EXISTS `staff`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff`
--

LOCK TABLES `staff` WRITE;
/*!40000 ALTER TABLE `staff` DISABLE KEYS */;
INSERT INTO `staff` VALUES (10,1,1,1,NULL,1,NULL,'Mathematics Teacher','permanent',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'active',NULL),(11,1,1,2,NULL,1,NULL,'English Teacher','permanent',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'active',NULL),(12,1,1,3,NULL,1,NULL,'Science Teacher','permanent',NULL,0,NULL,NULL,NULL,NULL,NULL,NULL,'active',NULL);
/*!40000 ALTER TABLE `staff` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `staff_attendance`
--

DROP TABLE IF EXISTS `staff_attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff_attendance` (
  `id` bigint NOT NULL,
  `staff_id` bigint NOT NULL,
  `date` date NOT NULL,
  `status` varchar(20) DEFAULT 'present',
  `notes` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff_attendance`
--

LOCK TABLES `staff_attendance` WRITE;
/*!40000 ALTER TABLE `staff_attendance` DISABLE KEYS */;
/*!40000 ALTER TABLE `staff_attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `staff_salaries`
--

DROP TABLE IF EXISTS `staff_salaries`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `staff_salaries` (
  `id` bigint NOT NULL,
  `staff_id` bigint NOT NULL,
  `month` year(4) DEFAULT NULL,
  `period_month` tinyint DEFAULT NULL,
  `definition_id` bigint NOT NULL,
  `amount` decimal(14,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `staff_salaries`
--

LOCK TABLES `staff_salaries` WRITE;
/*!40000 ALTER TABLE `staff_salaries` DISABLE KEYS */;
/*!40000 ALTER TABLE `staff_salaries` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `streams`
--

DROP TABLE IF EXISTS `streams`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `streams` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `class_id` bigint NOT NULL,
  `name` varchar(50) NOT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `streams`
--

LOCK TABLES `streams` WRITE;
/*!40000 ALTER TABLE `streams` DISABLE KEYS */;
/*!40000 ALTER TABLE `streams` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_attendance`
--

DROP TABLE IF EXISTS `student_attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_attendance` (
  `id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `date` date NOT NULL,
  `status` varchar(20) DEFAULT 'present',
  `method` varchar(50) DEFAULT 'manual',
  `time_in` time DEFAULT NULL,
  `time_out` time DEFAULT NULL,
  `notes` text COLLATE utf8_general_ci DEFAULT NULL,
  `marked_at` timestamp NULL DEFAULT NULL,
  `marked_by` int DEFAULT NULL,
  `attendance_session_id` bigint DEFAULT NULL COMMENT 'Link to attendance session',
  `term_id` bigint DEFAULT NULL COMMENT 'Academic term',
  `academic_year_id` bigint DEFAULT NULL COMMENT 'Academic year',
  `stream_id` bigint DEFAULT NULL COMMENT 'Student stream/section',
  `subject_id` bigint DEFAULT NULL COMMENT 'Subject (if applicable)',
  `teacher_id` bigint DEFAULT NULL COMMENT 'Teacher who took attendance',
  `device_id` bigint DEFAULT NULL COMMENT 'Biometric device ID',
  `biometric_timestamp` timestamp NULL DEFAULT NULL COMMENT 'Biometric capture timestamp',
  `confidence_score` decimal(5,2) DEFAULT NULL COMMENT 'Biometric confidence score',
  `override_reason` text DEFAULT NULL COMMENT 'Reason for admin override',
  `is_locked` tinyint(1) DEFAULT '0' COMMENT 'Attendance locked status',
  `locked_at` timestamp NULL DEFAULT NULL COMMENT 'When attendance was locked',
  KEY `idx_session` (`attendance_session_id`),
  KEY `idx_device` (`device_id`),
  KEY `idx_is_locked` (`is_locked`),
  KEY `idx_biometric_timestamp` (`biometric_timestamp`),
  KEY `idx_stream` (`stream_id`),
  KEY `idx_teacher` (`teacher_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_attendance`
--

LOCK TABLES `student_attendance` WRITE;
/*!40000 ALTER TABLE `student_attendance` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_contacts`
--

DROP TABLE IF EXISTS `student_contacts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_contacts` (
  `student_id` bigint NOT NULL,
  `contact_id` bigint NOT NULL,
  `relationship` varchar(50) DEFAULT NULL,
  `is_primary` tinyint(1) DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_contacts`
--

LOCK TABLES `student_contacts` WRITE;
/*!40000 ALTER TABLE `student_contacts` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_contacts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_curriculums`
--

DROP TABLE IF EXISTS `student_curriculums`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_curriculums` (
  `student_id` bigint NOT NULL,
  `curriculum_id` tinyint NOT NULL,
  `active` tinyint(1) DEFAULT '1',
  `assigned_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_curriculums`
--

LOCK TABLES `student_curriculums` WRITE;
/*!40000 ALTER TABLE `student_curriculums` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_curriculums` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_education_levels`
--

DROP TABLE IF EXISTS `student_education_levels`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_education_levels` (
  `id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `education_type` varchar(20) NOT NULL,
  `level_name` varchar(120) NOT NULL,
  `institution` varchar(150) DEFAULT NULL,
  `year_completed` year(4) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_education_levels`
--

LOCK TABLES `student_education_levels` WRITE;
/*!40000 ALTER TABLE `student_education_levels` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_education_levels` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_family_status`
--

DROP TABLE IF EXISTS `student_family_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_family_status` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_family_status`
--

LOCK TABLES `student_family_status` WRITE;
/*!40000 ALTER TABLE `student_family_status` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_family_status` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_fee_items`
--

DROP TABLE IF EXISTS `student_fee_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_fee_items` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_fee_items`
--

LOCK TABLES `student_fee_items` WRITE;
/*!40000 ALTER TABLE `student_fee_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_fee_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_fingerprints`
--

DROP TABLE IF EXISTS `student_fingerprints`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_fingerprints` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_fingerprints`
--

LOCK TABLES `student_fingerprints` WRITE;
/*!40000 ALTER TABLE `student_fingerprints` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_fingerprints` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_hafz_progress_summary`
--

DROP TABLE IF EXISTS `student_hafz_progress_summary`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_hafz_progress_summary` (
  `student_id` bigint NOT NULL,
  `juz_memorized` int DEFAULT '0',
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_hafz_progress_summary`
--

LOCK TABLES `student_hafz_progress_summary` WRITE;
/*!40000 ALTER TABLE `student_hafz_progress_summary` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_hafz_progress_summary` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_next_of_kin`
--

DROP TABLE IF EXISTS `student_next_of_kin`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_next_of_kin` (
  `id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `sequence` tinyint NOT NULL,
  `name` varchar(150) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `occupation` varchar(120) DEFAULT NULL,
  `contact` varchar(60) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_next_of_kin`
--

LOCK TABLES `student_next_of_kin` WRITE;
/*!40000 ALTER TABLE `student_next_of_kin` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_next_of_kin` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_profiles`
--

DROP TABLE IF EXISTS `student_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_profiles` (
  `student_id` bigint NOT NULL,
  `place_of_birth` varchar(150) DEFAULT NULL,
  `place_of_residence` varchar(150) DEFAULT NULL,
  `district_id` bigint DEFAULT NULL,
  `nationality_id` int DEFAULT NULL,
  `passport_document_id` bigint DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_profiles`
--

LOCK TABLES `student_profiles` WRITE;
/*!40000 ALTER TABLE `student_profiles` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `student_requirements`
--

DROP TABLE IF EXISTS `student_requirements`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `student_requirements` (
  `id` bigint NOT NULL,
  `student_id` bigint NOT NULL,
  `term_id` bigint NOT NULL,
  `requirement_id` bigint NOT NULL,
  `brought` tinyint(1) DEFAULT '0',
  `date_reported` date DEFAULT NULL,
  `notes` text COLLATE utf8_general_ci DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `student_requirements`
--

LOCK TABLES `student_requirements` WRITE;
/*!40000 ALTER TABLE `student_requirements` DISABLE KEYS */;
/*!40000 ALTER TABLE `student_requirements` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `students`
--

DROP TABLE IF EXISTS `students`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `students` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `school_id` bigint DEFAULT NULL,
  `person_id` bigint NOT NULL,
  `class_id` int DEFAULT NULL,
  `theology_class_id` int DEFAULT NULL,
  `admission_no` varchar(50) DEFAULT NULL,
  `village_id` bigint DEFAULT NULL,
  `admission_date` date DEFAULT NULL,
  `status` varchar(20) DEFAULT 'active',
  `promotion_status` enum('promoted','not_promoted','pending') DEFAULT 'pending',
  `last_promoted_at` datetime DEFAULT NULL,
  `previous_class_id` bigint DEFAULT NULL,
  `previous_year_id` bigint DEFAULT NULL,
  `notes` text COLLATE utf8_general_ci DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT NULL,
  `deleted_at` timestamp NULL DEFAULT NULL,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `fk_students_villages` (`village_id`),
  KEY `idx_promotion_status` (`promotion_status`),
  KEY `idx_last_promoted` (`last_promoted_at`),
  KEY `idx_previous_class` (`previous_class_id`),
  CONSTRAINT `fk_students_villages` FOREIGN KEY (`village_id`) REFERENCES `villages` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin AUTO_INCREMENT=120663;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `students`
--

LOCK TABLES `students` WRITE;
/*!40000 ALTER TABLE `students` DISABLE KEYS */;
INSERT INTO `students` VALUES (662,1,681,NULL,NULL,'XHN/0681/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 09:44:33',NULL,NULL),(30663,1,30682,NULL,NULL,'XHN/30682/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 14:13:22',NULL,NULL),(30664,1,30683,NULL,NULL,'XHN/30683/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 14:20:36',NULL,NULL),(30665,1,30684,NULL,NULL,'XHN/30684/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 14:22:33',NULL,NULL),(30666,1,30685,NULL,NULL,'XHN/30685/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 14:23:36',NULL,NULL),(30667,1,30686,NULL,NULL,'XHN/30686/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 14:24:53',NULL,NULL),(30668,1,30687,NULL,NULL,'XHN/30687/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 14:25:44',NULL,NULL),(30669,1,30688,NULL,NULL,'XHN/30688/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 14:33:21',NULL,NULL),(30670,1,30689,NULL,NULL,'XHN/30689/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 14:33:59',NULL,NULL),(30671,1,30690,NULL,NULL,'XHN/30690/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 14:34:43',NULL,NULL),(30672,1,30691,NULL,NULL,'XHN/30691/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 14:35:31',NULL,NULL),(60663,1,60682,NULL,NULL,'XHN/60682/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 15:38:45',NULL,NULL),(60664,1,60683,NULL,NULL,'XHN/60683/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 15:39:54',NULL,'2026-02-28 19:08:10'),(60665,1,60684,NULL,NULL,'XHN/60684/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 15:41:41',NULL,NULL),(90663,1,90682,NULL,NULL,'XHN/90682/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 18:58:31',NULL,NULL),(90664,1,90683,NULL,NULL,'XHN/90683/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 18:59:30',NULL,NULL),(90665,1,90684,NULL,NULL,'XHN/90684/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 19:02:53',NULL,NULL),(90666,1,90685,NULL,NULL,'XHN/90685/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 19:09:15',NULL,NULL),(90667,1,90686,NULL,NULL,'XHN/90686/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 19:09:42',NULL,NULL),(90668,1,90687,NULL,NULL,'XHN/90687/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 19:31:13',NULL,NULL),(90669,1,90688,NULL,NULL,'XHN/90688/2026',NULL,NULL,'active','pending',NULL,NULL,NULL,NULL,'2026-02-28 19:38:31',NULL,NULL);
/*!40000 ALTER TABLE `students` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subcounties`
--

DROP TABLE IF EXISTS `subcounties`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subcounties` (
  `id` bigint NOT NULL,
  `county_id` bigint NOT NULL,
  `name` varchar(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subcounties`
--

LOCK TABLES `subcounties` WRITE;
/*!40000 ALTER TABLE `subcounties` DISABLE KEYS */;
/*!40000 ALTER TABLE `subcounties` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `subjects`
--

DROP TABLE IF EXISTS `subjects`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `subjects` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `name` varchar(120) NOT NULL,
  `code` varchar(20) DEFAULT NULL,
  `subject_type` varchar(20) DEFAULT 'core'
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `subjects`
--

LOCK TABLES `subjects` WRITE;
/*!40000 ALTER TABLE `subjects` DISABLE KEYS */;
/*!40000 ALTER TABLE `subjects` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tahfiz_attendance`
--

DROP TABLE IF EXISTS `tahfiz_attendance`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tahfiz_attendance` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tahfiz_attendance`
--

LOCK TABLES `tahfiz_attendance` WRITE;
/*!40000 ALTER TABLE `tahfiz_attendance` DISABLE KEYS */;
/*!40000 ALTER TABLE `tahfiz_attendance` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tahfiz_books`
--

DROP TABLE IF EXISTS `tahfiz_books`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tahfiz_books` (
  `id` bigint NOT NULL,
  `school_id` bigint NOT NULL,
  `title` varchar(100) NOT NULL,
  `description` text COLLATE utf8_general_ci DEFAULT NULL,
  `total_units` int DEFAULT NULL,
  `unit_type` varchar(50) DEFAULT 'verse',
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_bin;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tahfiz_books`
--

LOCK TABLES `tahfiz_books` WRITE;
/*!40000 ALTER TABLE `tahfiz_books` DISABLE KEYS */;
/*!40000 ALTER TABLE `tahfiz_books` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tahfiz_groups`
--

DROP TABLE IF EXISTS `tahfiz_groups`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tahfiz_groups` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tahfiz_groups`
--

LOCK TABLES `tahfiz_groups` WRITE;
/*!40000 ALTER TABLE `tahfiz_groups` DISABLE KEYS */;
/*!40000 ALTER TABLE `tahfiz_groups` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tahfiz_plans`
--

DROP TABLE IF EXISTS `tahfiz_plans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tahfiz_plans` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tahfiz_plans`
--

LOCK TABLES `tahfiz_plans` WRITE;
/*!40000 ALTER TABLE `tahfiz_plans` DISABLE KEYS */;
/*!40000 ALTER TABLE `tahfiz_plans` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tahfiz_results`
--

DROP TABLE IF EXISTS `tahfiz_results`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tahfiz_results` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tahfiz_results`
--

LOCK TABLES `tahfiz_results` WRITE;
/*!40000 ALTER TABLE `tahfiz_results` DISABLE KEYS */;
/*!40000 ALTER TABLE `tahfiz_results` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `tahfiz_seven_metrics`
--

DROP TABLE IF EXISTS `tahfiz_seven_metrics`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `tahfiz_seven_metrics` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `tahfiz_seven_metrics`
--

LOCK TABLES `tahfiz_seven_metrics` WRITE;
/*!40000 ALTER TABLE `tahfiz_seven_metrics` DISABLE KEYS */;
/*!40000 ALTER TABLE `tahfiz_seven_metrics` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `terms`
--

DROP TABLE IF EXISTS `terms`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `terms` (
  `id` int NOT NULL AUTO_INCREMENT,
  `school_id` int NOT NULL DEFAULT '1',
  `name` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(20) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `academic_year_id` int DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT '1',
  `notes` text COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`) /*T![clustered_index] CLUSTERED */,
  KEY `idx_school_id` (`school_id`),
  KEY `idx_academic_year_id` (`academic_year_id`),
  KEY `idx_dates` (`start_date`,`end_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_INCREMENT=4;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `terms`
--

LOCK TABLES `terms` WRITE;
/*!40000 ALTER TABLE `terms` DISABLE KEYS */;
/*!40000 ALTER TABLE `terms` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_notifications`
--

DROP TABLE IF EXISTS `user_notifications`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_notifications` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_notifications`
--

LOCK TABLES `user_notifications` WRITE;
/*!40000 ALTER TABLE `user_notifications` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_notifications` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_sessions`
--

DROP TABLE IF EXISTS `user_sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_sessions` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_sessions`
--

LOCK TABLES `user_sessions` WRITE;
/*!40000 ALTER TABLE `user_sessions` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_sessions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Temporary view structure for view `v_today_arrivals`
--

DROP TABLE IF EXISTS `v_today_arrivals`;
/*!50001 DROP VIEW IF EXISTS `v_today_arrivals`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_today_arrivals` AS SELECT 
 1 AS `school_id`,
 1 AS `person_id`,
 1 AS `student_id_number`,
 1 AS `student_name`,
 1 AS `class_name`,
 1 AS `status`,
 1 AS `first_arrival_time`,
 1 AS `device_location`,
 1 AS `arrival_status`,
 1 AS `arrival_device_id`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure for table `villages`
--

DROP TABLE IF EXISTS `villages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `villages` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `villages`
--

LOCK TABLES `villages` WRITE;
/*!40000 ALTER TABLE `villages` DISABLE KEYS */;
/*!40000 ALTER TABLE `villages` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `waivers_discounts`
--

DROP TABLE IF EXISTS `waivers_discounts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `waivers_discounts` (
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
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `waivers_discounts`
--

LOCK TABLES `waivers_discounts` WRITE;
/*!40000 ALTER TABLE `waivers_discounts` DISABLE KEYS */;
/*!40000 ALTER TABLE `waivers_discounts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Final view structure for view `v_today_arrivals`
--

/*!50001 DROP VIEW IF EXISTS `v_today_arrivals`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_bin */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`2qzYvPUSbNa3RNc.root`@`%` SQL SECURITY DEFINER */
/*!50001 VIEW `v_today_arrivals` (`school_id`, `person_id`, `student_id_number`, `student_name`, `class_name`, `status`, `first_arrival_time`, `device_location`, `arrival_status`, `arrival_device_id`) AS SELECT 1 AS `school_id`,1 AS `person_id`,1 AS `student_id_number`,1 AS `student_name`,1 AS `class_name`,1 AS `status`,1 AS `first_arrival_time`,1 AS `device_location`,1 AS `arrival_status`,1 AS `arrival_device_id` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-03-01 13:38:00
