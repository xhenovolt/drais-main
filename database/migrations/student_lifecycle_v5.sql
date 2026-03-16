-- ============================================
-- DRAIS SCHOOL MANAGEMENT SYSTEM
-- Migration: Student Lifecycle & Reporting Architecture v5.0
-- Purpose: Full student lifecycle tracking, historical reports,
--          term-exam mapping, enrollment history, promotion tracking
-- Compatible with: MySQL 8.0+ / MariaDB 10.4+
-- Date: March 2026
-- ============================================

-- ============================================
-- SECTION 1: ENSURE TERMS TABLE EXISTS
-- (Missing from original production DB)
-- ============================================

CREATE TABLE IF NOT EXISTS `terms` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `school_id` BIGINT NOT NULL DEFAULT 1,
  `academic_year_id` BIGINT DEFAULT NULL,
  `name` VARCHAR(100) NOT NULL,
  `code` VARCHAR(20) DEFAULT NULL,
  `start_date` DATE DEFAULT NULL,
  `end_date` DATE DEFAULT NULL,
  `status` VARCHAR(20) DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_school_id` (`school_id`),
  KEY `idx_academic_year_id` (`academic_year_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- SECTION 2: ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================

-- 2a. Add school_id to enrollments if missing
ALTER TABLE `enrollments`
  ADD COLUMN IF NOT EXISTS `school_id` BIGINT NOT NULL DEFAULT 1 FIRST;

-- 2b. Add academic_year_id to report_cards for historical tracking
ALTER TABLE `report_cards`
  ADD COLUMN IF NOT EXISTS `academic_year_id` BIGINT DEFAULT NULL AFTER `term_id`,
  ADD COLUMN IF NOT EXISTS `enrollment_id` BIGINT DEFAULT NULL AFTER `academic_year_id`,
  ADD COLUMN IF NOT EXISTS `class_id` BIGINT DEFAULT NULL AFTER `enrollment_id`,
  ADD COLUMN IF NOT EXISTS `report_date` DATE DEFAULT NULL AFTER `dos_comment`,
  ADD COLUMN IF NOT EXISTS `school_id` BIGINT NOT NULL DEFAULT 1 AFTER `id`,
  ADD COLUMN IF NOT EXISTS `status` VARCHAR(20) DEFAULT 'draft' AFTER `report_date`,
  ADD COLUMN IF NOT EXISTS `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER `status`,
  ADD COLUMN IF NOT EXISTS `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`;

-- 2c. Ensure class_results has academic_year_id column
ALTER TABLE `class_results`
  ADD COLUMN IF NOT EXISTS `academic_year_id` BIGINT DEFAULT NULL AFTER `term_id`,
  ADD COLUMN IF NOT EXISTS `enrollment_id` BIGINT DEFAULT NULL AFTER `academic_year_id`;

-- 2d. Ensure students table has all lifecycle columns
ALTER TABLE `students`
  ADD COLUMN IF NOT EXISTS `promotion_status` ENUM('promoted','not_promoted','pending','graduated','dropped_out') DEFAULT 'pending' AFTER `status`,
  ADD COLUMN IF NOT EXISTS `last_promoted_at` DATETIME DEFAULT NULL AFTER `promotion_status`,
  ADD COLUMN IF NOT EXISTS `previous_class_id` BIGINT DEFAULT NULL AFTER `last_promoted_at`,
  ADD COLUMN IF NOT EXISTS `previous_year_id` BIGINT DEFAULT NULL AFTER `previous_class_id`,
  ADD COLUMN IF NOT EXISTS `graduation_date` DATE DEFAULT NULL AFTER `previous_year_id`,
  ADD COLUMN IF NOT EXISTS `current_enrollment_id` BIGINT DEFAULT NULL AFTER `graduation_date`;

-- 2e. Add enrollment_date and end_date to enrollments for history
ALTER TABLE `enrollments`
  ADD COLUMN IF NOT EXISTS `enrollment_date` DATE DEFAULT NULL AFTER `status`,
  ADD COLUMN IF NOT EXISTS `end_date` DATE DEFAULT NULL AFTER `enrollment_date`,
  ADD COLUMN IF NOT EXISTS `end_reason` VARCHAR(50) DEFAULT NULL AFTER `end_date`,
  ADD COLUMN IF NOT EXISTS `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`;

-- 2f. Add weight columns to report_card_subjects for mid/end terms
ALTER TABLE `report_card_subjects`
  ADD COLUMN IF NOT EXISTS `mid_term_score` DECIMAL(5,2) DEFAULT NULL AFTER `total_score`,
  ADD COLUMN IF NOT EXISTS `end_term_score` DECIMAL(5,2) DEFAULT NULL AFTER `mid_term_score`,
  ADD COLUMN IF NOT EXISTS `teacher_initials` VARCHAR(10) DEFAULT NULL AFTER `position`;

-- ============================================
-- SECTION 3: NEW INDEXES FOR PERFORMANCE
-- ============================================

-- Enrollments: query by student + year (critical for lifecycle history)
CREATE INDEX IF NOT EXISTS `idx_enrollment_student_year`
  ON `enrollments` (`student_id`, `academic_year_id`);

CREATE INDEX IF NOT EXISTS `idx_enrollment_student_class_year`
  ON `enrollments` (`student_id`, `class_id`, `academic_year_id`);

-- Report cards: query by student + year for historical reports
CREATE INDEX IF NOT EXISTS `idx_rc_student_year`
  ON `report_cards` (`student_id`, `academic_year_id`);

CREATE INDEX IF NOT EXISTS `idx_rc_student_term`
  ON `report_cards` (`student_id`, `term_id`);

CREATE INDEX IF NOT EXISTS `idx_rc_enrollment`
  ON `report_cards` (`enrollment_id`);

-- Class results: query by enrollment for lifecycle
CREATE INDEX IF NOT EXISTS `idx_cr_enrollment`
  ON `class_results` (`enrollment_id`);

CREATE INDEX IF NOT EXISTS `idx_cr_student_year_term`
  ON `class_results` (`student_id`, `academic_year_id`, `term_id`);

-- ============================================
-- SECTION 4: REPORTING VIEWS
-- ============================================

-- View: Student Enrollment History (all classes across years)
DROP VIEW IF EXISTS `v_student_enrollment_history`;
CREATE VIEW `v_student_enrollment_history` AS
SELECT
  e.id AS enrollment_id,
  e.student_id,
  s.admission_no,
  p.first_name,
  p.last_name,
  p.gender,
  p.photo_url,
  c.id AS class_id,
  c.name AS class_name,
  c.level AS class_level,
  st.id AS stream_id,
  st.name AS stream_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  t.id AS term_id,
  t.name AS term_name,
  e.status AS enrollment_status,
  e.enrollment_date,
  e.end_date,
  e.end_reason,
  s.status AS student_status,
  s.promotion_status
FROM enrollments e
JOIN students s ON e.student_id = s.id
JOIN people p ON s.person_id = p.id
LEFT JOIN classes c ON e.class_id = c.id
LEFT JOIN streams st ON e.stream_id = st.id
LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
LEFT JOIN terms t ON e.term_id = t.id
WHERE s.deleted_at IS NULL;

-- View: Student Report Summary (all reports with details)
DROP VIEW IF EXISTS `v_student_report_summary`;
CREATE VIEW `v_student_report_summary` AS
SELECT
  rc.id AS report_card_id,
  rc.student_id,
  s.admission_no,
  p.first_name,
  p.last_name,
  p.gender,
  p.photo_url,
  c.name AS class_name,
  c.level AS class_level,
  st.name AS stream_name,
  t.id AS term_id,
  t.name AS term_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  rc.overall_grade,
  rc.class_teacher_comment,
  rc.headteacher_comment,
  rc.dos_comment,
  rc.report_date,
  rc.status AS report_status,
  rcm.total_score,
  rcm.average_score,
  rcm.position,
  rcm.promoted
FROM report_cards rc
JOIN students s ON rc.student_id = s.id
JOIN people p ON s.person_id = p.id
LEFT JOIN terms t ON rc.term_id = t.id
LEFT JOIN academic_years ay ON rc.academic_year_id = ay.id
            OR (rc.academic_year_id IS NULL AND t.academic_year_id = ay.id)
LEFT JOIN enrollments e ON rc.enrollment_id = e.id
LEFT JOIN classes c ON COALESCE(rc.class_id, e.class_id) = c.id
LEFT JOIN streams st ON e.stream_id = st.id
LEFT JOIN report_card_metrics rcm ON rc.id = rcm.report_card_id
WHERE s.deleted_at IS NULL;

-- View: Student Current Status
DROP VIEW IF EXISTS `v_student_current_status`;
CREATE VIEW `v_student_current_status` AS
SELECT
  s.id AS student_id,
  s.admission_no,
  s.school_id,
  p.first_name,
  p.last_name,
  p.gender,
  p.photo_url,
  s.status AS student_status,
  s.promotion_status,
  s.last_promoted_at,
  s.admission_date,
  e.id AS enrollment_id,
  c.id AS class_id,
  c.name AS class_name,
  c.level AS class_level,
  st.name AS stream_name,
  ay.id AS academic_year_id,
  ay.name AS academic_year_name,
  t.id AS term_id,
  t.name AS term_name,
  prev_c.name AS previous_class_name
FROM students s
JOIN people p ON s.person_id = p.id
LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
LEFT JOIN classes c ON e.class_id = c.id
LEFT JOIN streams st ON e.stream_id = st.id
LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
LEFT JOIN terms t ON e.term_id = t.id
LEFT JOIN classes prev_c ON s.previous_class_id = prev_c.id
WHERE s.deleted_at IS NULL;

-- ============================================
-- SECTION 5: DEFAULT DATA - Academic Years and Terms
-- (Insert only if empty)
-- ============================================

-- Insert academic years if none exist
INSERT INTO `academic_years` (`school_id`, `name`, `start_date`, `end_date`, `status`)
SELECT 1, '2025', '2025-02-03', '2025-11-28', 'closed'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `academic_years` WHERE `name` = '2025' AND `school_id` = 1);

INSERT INTO `academic_years` (`school_id`, `name`, `start_date`, `end_date`, `status`)
SELECT 1, '2026', '2026-02-02', '2026-11-27', 'active'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `academic_years` WHERE `name` = '2026' AND `school_id` = 1);

-- Insert terms for 2025 if none exist
INSERT INTO `terms` (`school_id`, `academic_year_id`, `name`, `code`, `start_date`, `end_date`, `status`)
SELECT 1, ay.id, 'Term 1', 'T1-2025', '2025-02-03', '2025-05-02', 'closed'
FROM `academic_years` ay WHERE ay.name = '2025' AND ay.school_id = 1
AND NOT EXISTS (SELECT 1 FROM `terms` t WHERE t.name = 'Term 1' AND t.academic_year_id = ay.id);

INSERT INTO `terms` (`school_id`, `academic_year_id`, `name`, `code`, `start_date`, `end_date`, `status`)
SELECT 1, ay.id, 'Term 2', 'T2-2025', '2025-05-26', '2025-08-22', 'closed'
FROM `academic_years` ay WHERE ay.name = '2025' AND ay.school_id = 1
AND NOT EXISTS (SELECT 1 FROM `terms` t WHERE t.name = 'Term 2' AND t.academic_year_id = ay.id);

INSERT INTO `terms` (`school_id`, `academic_year_id`, `name`, `code`, `start_date`, `end_date`, `status`)
SELECT 1, ay.id, 'Term 3', 'T3-2025', '2025-09-08', '2025-11-28', 'closed'
FROM `academic_years` ay WHERE ay.name = '2025' AND ay.school_id = 1
AND NOT EXISTS (SELECT 1 FROM `terms` t WHERE t.name = 'Term 3' AND t.academic_year_id = ay.id);

-- Insert terms for 2026
INSERT INTO `terms` (`school_id`, `academic_year_id`, `name`, `code`, `start_date`, `end_date`, `status`)
SELECT 1, ay.id, 'Term 1', 'T1-2026', '2026-02-02', '2026-04-30', 'active'
FROM `academic_years` ay WHERE ay.name = '2026' AND ay.school_id = 1
AND NOT EXISTS (SELECT 1 FROM `terms` t WHERE t.name = 'Term 1' AND t.academic_year_id = ay.id);

INSERT INTO `terms` (`school_id`, `academic_year_id`, `name`, `code`, `start_date`, `end_date`, `status`)
SELECT 1, ay.id, 'Term 2', 'T2-2026', '2026-05-25', '2026-08-21', 'scheduled'
FROM `academic_years` ay WHERE ay.name = '2026' AND ay.school_id = 1
AND NOT EXISTS (SELECT 1 FROM `terms` t WHERE t.name = 'Term 2' AND t.academic_year_id = ay.id);

INSERT INTO `terms` (`school_id`, `academic_year_id`, `name`, `code`, `start_date`, `end_date`, `status`)
SELECT 1, ay.id, 'Term 3', 'T3-2026', '2026-09-07', '2026-11-27', 'scheduled'
FROM `academic_years` ay WHERE ay.name = '2026' AND ay.school_id = 1
AND NOT EXISTS (SELECT 1 FROM `terms` t WHERE t.name = 'Term 3' AND t.academic_year_id = ay.id);

-- ============================================
-- SECTION 6: BACKFILL EXISTING DATA
-- Link existing class_results to academic years via terms
-- ============================================

-- Backfill class_results.academic_year_id from the term's academic year
UPDATE `class_results` cr
JOIN `terms` t ON cr.term_id = t.id
SET cr.academic_year_id = t.academic_year_id
WHERE cr.academic_year_id IS NULL AND t.academic_year_id IS NOT NULL;

-- Backfill enrollments.academic_year_id from the term's academic year
UPDATE `enrollments` e
JOIN `terms` t ON e.term_id = t.id
SET e.academic_year_id = t.academic_year_id
WHERE e.academic_year_id IS NULL AND t.academic_year_id IS NOT NULL;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================
