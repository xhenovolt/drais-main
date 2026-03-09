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
