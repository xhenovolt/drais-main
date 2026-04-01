-- ============================================
-- DRAIS SCHOOL MANAGEMENT SYSTEM
-- Test Data: Student Lifecycle & Historical Reports
-- Purpose: Populate sample learners with results across
--          multiple years, terms, promotions, and reports
-- ============================================

-- ============================================
-- SECTION 1: ENSURE ACADEMIC YEARS & TERMS EXIST
-- ============================================

-- Academic Year 2024 (historical)
INSERT INTO `academic_years` (`school_id`, `name`, `start_date`, `end_date`, `status`)
SELECT 1, '2024', '2024-02-05', '2024-11-29', 'closed'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `academic_years` WHERE `name` = '2024' AND `school_id` = 1);

-- Get academic year IDs
SET @ay2024 = (SELECT id FROM `academic_years` WHERE `name` = '2024' AND `school_id` = 1 LIMIT 1);
SET @ay2025 = (SELECT id FROM `academic_years` WHERE `name` = '2025' AND `school_id` = 1 LIMIT 1);
SET @ay2026 = (SELECT id FROM `academic_years` WHERE `name` = '2026' AND `school_id` = 1 LIMIT 1);

-- Terms for 2024
INSERT INTO `terms` (`school_id`, `academic_year_id`, `name`, `code`, `start_date`, `end_date`, `status`)
SELECT 1, @ay2024, 'Term 1', 'T1-2024', '2024-02-05', '2024-05-03', 'closed'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `terms` WHERE `name` = 'Term 1' AND `academic_year_id` = @ay2024);

INSERT INTO `terms` (`school_id`, `academic_year_id`, `name`, `code`, `start_date`, `end_date`, `status`)
SELECT 1, @ay2024, 'Term 2', 'T2-2024', '2024-05-27', '2024-08-23', 'closed'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `terms` WHERE `name` = 'Term 2' AND `academic_year_id` = @ay2024);

INSERT INTO `terms` (`school_id`, `academic_year_id`, `name`, `code`, `start_date`, `end_date`, `status`)
SELECT 1, @ay2024, 'Term 3', 'T3-2024', '2024-09-09', '2024-11-29', 'closed'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `terms` WHERE `name` = 'Term 3' AND `academic_year_id` = @ay2024);

-- Get term IDs
SET @t1_2024 = (SELECT id FROM `terms` WHERE `name` = 'Term 1' AND `academic_year_id` = @ay2024 LIMIT 1);
SET @t2_2024 = (SELECT id FROM `terms` WHERE `name` = 'Term 2' AND `academic_year_id` = @ay2024 LIMIT 1);
SET @t3_2024 = (SELECT id FROM `terms` WHERE `name` = 'Term 3' AND `academic_year_id` = @ay2024 LIMIT 1);

SET @t1_2025 = (SELECT id FROM `terms` WHERE `name` = 'Term 1' AND `academic_year_id` = @ay2025 LIMIT 1);
SET @t2_2025 = (SELECT id FROM `terms` WHERE `name` = 'Term 2' AND `academic_year_id` = @ay2025 LIMIT 1);
SET @t3_2025 = (SELECT id FROM `terms` WHERE `name` = 'Term 3' AND `academic_year_id` = @ay2025 LIMIT 1);

SET @t1_2026 = (SELECT id FROM `terms` WHERE `name` = 'Term 1' AND `academic_year_id` = @ay2026 LIMIT 1);

-- ============================================
-- SECTION 2: ENSURE CLASSES EXIST
-- ============================================

-- Ensure Primary 1 through Primary 7 exist
INSERT INTO `classes` (`school_id`, `name`, `code`, `level`)
SELECT 1, 'Primary 1', 'P1', 1
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `classes` WHERE `name` = 'Primary 1' AND `school_id` = 1);

INSERT INTO `classes` (`school_id`, `name`, `code`, `level`)
SELECT 1, 'Primary 2', 'P2', 2
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `classes` WHERE `name` = 'Primary 2' AND `school_id` = 1);

INSERT INTO `classes` (`school_id`, `name`, `code`, `level`)
SELECT 1, 'Primary 3', 'P3', 3
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `classes` WHERE `name` = 'Primary 3' AND `school_id` = 1);

INSERT INTO `classes` (`school_id`, `name`, `code`, `level`)
SELECT 1, 'Primary 4', 'P4', 4
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `classes` WHERE `name` = 'Primary 4' AND `school_id` = 1);

INSERT INTO `classes` (`school_id`, `name`, `code`, `level`)
SELECT 1, 'Primary 5', 'P5', 5
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `classes` WHERE `name` = 'Primary 5' AND `school_id` = 1);

-- Get class IDs
SET @p1 = (SELECT id FROM `classes` WHERE `name` = 'Primary 1' AND `school_id` = 1 LIMIT 1);
SET @p2 = (SELECT id FROM `classes` WHERE `name` = 'Primary 2' AND `school_id` = 1 LIMIT 1);
SET @p3 = (SELECT id FROM `classes` WHERE `name` = 'Primary 3' AND `school_id` = 1 LIMIT 1);
SET @p4 = (SELECT id FROM `classes` WHERE `name` = 'Primary 4' AND `school_id` = 1 LIMIT 1);
SET @p5 = (SELECT id FROM `classes` WHERE `name` = 'Primary 5' AND `school_id` = 1 LIMIT 1);

-- ============================================
-- SECTION 3: ENSURE SUBJECTS EXIST
-- ============================================

INSERT INTO `subjects` (`school_id`, `name`, `code`, `subject_type`)
SELECT 1, 'Mathematics', 'MATH', 'core'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `subjects` WHERE `name` = 'Mathematics' AND `school_id` = 1);

INSERT INTO `subjects` (`school_id`, `name`, `code`, `subject_type`)
SELECT 1, 'English', 'ENG', 'core'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `subjects` WHERE `name` = 'English' AND `school_id` = 1);

INSERT INTO `subjects` (`school_id`, `name`, `code`, `subject_type`)
SELECT 1, 'Science', 'SCI', 'core'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `subjects` WHERE `name` = 'Science' AND `school_id` = 1);

INSERT INTO `subjects` (`school_id`, `name`, `code`, `subject_type`)
SELECT 1, 'Social Studies', 'SST', 'core'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `subjects` WHERE `name` = 'Social Studies' AND `school_id` = 1);

INSERT INTO `subjects` (`school_id`, `name`, `code`, `subject_type`)
SELECT 1, 'Religious Education', 'RE', 'core'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `subjects` WHERE `name` = 'Religious Education' AND `school_id` = 1);

-- Get subject IDs
SET @math = (SELECT id FROM `subjects` WHERE `name` = 'Mathematics' AND `school_id` = 1 LIMIT 1);
SET @eng = (SELECT id FROM `subjects` WHERE `name` = 'English' AND `school_id` = 1 LIMIT 1);
SET @sci = (SELECT id FROM `subjects` WHERE `name` = 'Science' AND `school_id` = 1 LIMIT 1);
SET @sst = (SELECT id FROM `subjects` WHERE `name` = 'Social Studies' AND `school_id` = 1 LIMIT 1);
SET @re = (SELECT id FROM `subjects` WHERE `name` = 'Religious Education' AND `school_id` = 1 LIMIT 1);

-- ============================================
-- SECTION 4: ENSURE RESULT TYPES EXIST
-- ============================================

SET @rt_mid = (SELECT id FROM `result_types` WHERE `name` LIKE '%MID%' AND `school_id` = 1 LIMIT 1);
SET @rt_end = (SELECT id FROM `result_types` WHERE `name` LIKE '%END%' AND `school_id` = 1 LIMIT 1);

-- If result types don't exist, create them
INSERT INTO `result_types` (`school_id`, `name`, `code`, `weight`, `status`)
SELECT 1, 'MID OF TERM', 'MOT', 40.00, 'active'
FROM DUAL WHERE @rt_mid IS NULL;

INSERT INTO `result_types` (`school_id`, `name`, `code`, `weight`, `status`)
SELECT 1, 'END OF TERM', 'EOT', 60.00, 'active'
FROM DUAL WHERE @rt_end IS NULL;

SET @rt_mid = (SELECT id FROM `result_types` WHERE `name` LIKE '%MID%' AND `school_id` = 1 LIMIT 1);
SET @rt_end = (SELECT id FROM `result_types` WHERE `name` LIKE '%END%' AND `school_id` = 1 LIMIT 1);

-- ============================================
-- SECTION 5: TEST PERSON + STUDENT RECORDS
-- (3 test students with lifecycle data)
-- ============================================

-- Test Person 1: Ahmed Nakibinge (will be promoted P2→P3→P4 across years)
INSERT INTO `people` (`first_name`, `last_name`, `gender`, `date_of_birth`)
SELECT 'Ahmed', 'Nakibinge', 'male', '2016-03-15'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `people` WHERE `first_name` = 'Ahmed' AND `last_name` = 'Nakibinge'
);
SET @person1 = (SELECT id FROM `people` WHERE `first_name` = 'Ahmed' AND `last_name` = 'Nakibinge' LIMIT 1);

INSERT INTO `students` (`school_id`, `person_id`, `admission_no`, `admission_date`, `status`, `promotion_status`)
SELECT 1, @person1, 'TEST-001', '2023-02-06', 'active', 'promoted'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `students` WHERE `admission_no` = 'TEST-001');
SET @stu1 = (SELECT id FROM `students` WHERE `admission_no` = 'TEST-001' LIMIT 1);

-- Test Person 2: Fatima Namukasa (promoted P1→P2→P3)
INSERT INTO `people` (`first_name`, `last_name`, `gender`, `date_of_birth`)
SELECT 'Fatima', 'Namukasa', 'female', '2017-07-20'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `people` WHERE `first_name` = 'Fatima' AND `last_name` = 'Namukasa'
);
SET @person2 = (SELECT id FROM `people` WHERE `first_name` = 'Fatima' AND `last_name` = 'Namukasa' LIMIT 1);

INSERT INTO `students` (`school_id`, `person_id`, `admission_no`, `admission_date`, `status`, `promotion_status`)
SELECT 1, @person2, 'TEST-002', '2024-02-05', 'active', 'promoted'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `students` WHERE `admission_no` = 'TEST-002');
SET @stu2 = (SELECT id FROM `students` WHERE `admission_no` = 'TEST-002' LIMIT 1);

-- Test Person 3: Ibrahim Musoke (promoted P3→P4→P5)
INSERT INTO `people` (`first_name`, `last_name`, `gender`, `date_of_birth`)
SELECT 'Ibrahim', 'Musoke', 'male', '2015-01-10'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `people` WHERE `first_name` = 'Ibrahim' AND `last_name` = 'Musoke'
);
SET @person3 = (SELECT id FROM `people` WHERE `first_name` = 'Ibrahim' AND `last_name` = 'Musoke' LIMIT 1);

INSERT INTO `students` (`school_id`, `person_id`, `admission_no`, `admission_date`, `status`, `promotion_status`)
SELECT 1, @person3, 'TEST-003', '2022-02-07', 'active', 'promoted'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `students` WHERE `admission_no` = 'TEST-003');
SET @stu3 = (SELECT id FROM `students` WHERE `admission_no` = 'TEST-003' LIMIT 1);

-- ============================================
-- SECTION 6: ENROLLMENT HISTORY
-- Each student has enrollments across multiple years
-- ============================================

-- Student 1: Ahmed — P2 in 2024, P3 in 2025, P4 in 2026
INSERT INTO `enrollments` (`school_id`, `student_id`, `class_id`, `academic_year_id`, `status`, `enrollment_date`, `end_date`, `end_reason`, `created_at`)
SELECT 1, @stu1, @p2, @ay2024, 'completed', '2024-02-05', '2024-11-29', 'promoted', UNIX_TIMESTAMP('2024-02-05')
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `enrollments` WHERE `student_id` = @stu1 AND `academic_year_id` = @ay2024
);

INSERT INTO `enrollments` (`school_id`, `student_id`, `class_id`, `academic_year_id`, `status`, `enrollment_date`, `end_date`, `end_reason`, `created_at`)
SELECT 1, @stu1, @p3, @ay2025, 'completed', '2025-02-03', '2025-11-28', 'promoted', UNIX_TIMESTAMP('2025-02-03')
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `enrollments` WHERE `student_id` = @stu1 AND `academic_year_id` = @ay2025
);

INSERT INTO `enrollments` (`school_id`, `student_id`, `class_id`, `academic_year_id`, `status`, `enrollment_date`, `created_at`)
SELECT 1, @stu1, @p4, @ay2026, 'active', '2026-02-02', UNIX_TIMESTAMP('2026-02-02')
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `enrollments` WHERE `student_id` = @stu1 AND `academic_year_id` = @ay2026
);

-- Student 2: Fatima — P1 in 2024, P2 in 2025, P3 in 2026
INSERT INTO `enrollments` (`school_id`, `student_id`, `class_id`, `academic_year_id`, `status`, `enrollment_date`, `end_date`, `end_reason`, `created_at`)
SELECT 1, @stu2, @p1, @ay2024, 'completed', '2024-02-05', '2024-11-29', 'promoted', UNIX_TIMESTAMP('2024-02-05')
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `enrollments` WHERE `student_id` = @stu2 AND `academic_year_id` = @ay2024
);

INSERT INTO `enrollments` (`school_id`, `student_id`, `class_id`, `academic_year_id`, `status`, `enrollment_date`, `end_date`, `end_reason`, `created_at`)
SELECT 1, @stu2, @p2, @ay2025, 'completed', '2025-02-03', '2025-11-28', 'promoted', UNIX_TIMESTAMP('2025-02-03')
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `enrollments` WHERE `student_id` = @stu2 AND `academic_year_id` = @ay2025
);

INSERT INTO `enrollments` (`school_id`, `student_id`, `class_id`, `academic_year_id`, `status`, `enrollment_date`, `created_at`)
SELECT 1, @stu2, @p3, @ay2026, 'active', '2026-02-02', UNIX_TIMESTAMP('2026-02-02')
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `enrollments` WHERE `student_id` = @stu2 AND `academic_year_id` = @ay2026
);

-- Student 3: Ibrahim — P3 in 2024, P4 in 2025, P5 in 2026
INSERT INTO `enrollments` (`school_id`, `student_id`, `class_id`, `academic_year_id`, `status`, `enrollment_date`, `end_date`, `end_reason`, `created_at`)
SELECT 1, @stu3, @p3, @ay2024, 'completed', '2024-02-05', '2024-11-29', 'promoted', UNIX_TIMESTAMP('2024-02-05')
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `enrollments` WHERE `student_id` = @stu3 AND `academic_year_id` = @ay2024
);

INSERT INTO `enrollments` (`school_id`, `student_id`, `class_id`, `academic_year_id`, `status`, `enrollment_date`, `end_date`, `end_reason`, `created_at`)
SELECT 1, @stu3, @p4, @ay2025, 'completed', '2025-02-03', '2025-11-28', 'promoted', UNIX_TIMESTAMP('2025-02-03')
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `enrollments` WHERE `student_id` = @stu3 AND `academic_year_id` = @ay2025
);

INSERT INTO `enrollments` (`school_id`, `student_id`, `class_id`, `academic_year_id`, `status`, `enrollment_date`, `created_at`)
SELECT 1, @stu3, @p5, @ay2026, 'active', '2026-02-02', UNIX_TIMESTAMP('2026-02-02')
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `enrollments` WHERE `student_id` = @stu3 AND `academic_year_id` = @ay2026
);

-- ============================================
-- SECTION 7: PROMOTION HISTORY
-- ============================================

INSERT INTO `promotions` (`school_id`, `student_id`, `from_class_id`, `to_class_id`, `from_academic_year_id`, `to_academic_year_id`, `promotion_status`, `remarks`)
SELECT 1, @stu1, @p2, @p3, @ay2024, @ay2025, 'promoted', 'End of year promotion'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `promotions` WHERE `student_id` = @stu1 AND `from_academic_year_id` = @ay2024
);

INSERT INTO `promotions` (`school_id`, `student_id`, `from_class_id`, `to_class_id`, `from_academic_year_id`, `to_academic_year_id`, `promotion_status`, `remarks`)
SELECT 1, @stu1, @p3, @p4, @ay2025, @ay2026, 'promoted', 'End of year promotion'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `promotions` WHERE `student_id` = @stu1 AND `from_academic_year_id` = @ay2025
);

INSERT INTO `promotions` (`school_id`, `student_id`, `from_class_id`, `to_class_id`, `from_academic_year_id`, `to_academic_year_id`, `promotion_status`, `remarks`)
SELECT 1, @stu2, @p1, @p2, @ay2024, @ay2025, 'promoted', 'End of year promotion'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `promotions` WHERE `student_id` = @stu2 AND `from_academic_year_id` = @ay2024
);

INSERT INTO `promotions` (`school_id`, `student_id`, `from_class_id`, `to_class_id`, `from_academic_year_id`, `to_academic_year_id`, `promotion_status`, `remarks`)
SELECT 1, @stu2, @p2, @p3, @ay2025, @ay2026, 'promoted', 'End of year promotion'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `promotions` WHERE `student_id` = @stu2 AND `from_academic_year_id` = @ay2025
);

INSERT INTO `promotions` (`school_id`, `student_id`, `from_class_id`, `to_class_id`, `from_academic_year_id`, `to_academic_year_id`, `promotion_status`, `remarks`)
SELECT 1, @stu3, @p3, @p4, @ay2024, @ay2025, 'promoted', 'End of year promotion'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `promotions` WHERE `student_id` = @stu3 AND `from_academic_year_id` = @ay2024
);

INSERT INTO `promotions` (`school_id`, `student_id`, `from_class_id`, `to_class_id`, `from_academic_year_id`, `to_academic_year_id`, `promotion_status`, `remarks`)
SELECT 1, @stu3, @p4, @p5, @ay2025, @ay2026, 'promoted', 'End of year promotion'
FROM DUAL WHERE NOT EXISTS (
  SELECT 1 FROM `promotions` WHERE `student_id` = @stu3 AND `from_academic_year_id` = @ay2025
);

-- ============================================
-- SECTION 8: CLASS RESULTS ACROSS YEARS/TERMS
-- For each student, 3 terms × 5 subjects × 2 result types = 30 results per year
-- ============================================

-- ========== STUDENT 1: Ahmed — P2 in 2024 ==========
-- Term 1, 2024 - Mid Term
INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu1, @p2, @math, @t1_2024, @ay2024, @rt_mid, 72),
(@stu1, @p2, @eng, @t1_2024, @ay2024, @rt_mid, 68),
(@stu1, @p2, @sci, @t1_2024, @ay2024, @rt_mid, 75),
(@stu1, @p2, @sst, @t1_2024, @ay2024, @rt_mid, 65),
(@stu1, @p2, @re, @t1_2024, @ay2024, @rt_mid, 80)
ON DUPLICATE KEY UPDATE score = VALUES(score);

-- Term 1, 2024 - End of Term
INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu1, @p2, @math, @t1_2024, @ay2024, @rt_end, 78),
(@stu1, @p2, @eng, @t1_2024, @ay2024, @rt_end, 72),
(@stu1, @p2, @sci, @t1_2024, @ay2024, @rt_end, 80),
(@stu1, @p2, @sst, @t1_2024, @ay2024, @rt_end, 70),
(@stu1, @p2, @re, @t1_2024, @ay2024, @rt_end, 85)
ON DUPLICATE KEY UPDATE score = VALUES(score);

-- Term 2, 2024 - Mid & End
INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu1, @p2, @math, @t2_2024, @ay2024, @rt_mid, 74),
(@stu1, @p2, @eng, @t2_2024, @ay2024, @rt_mid, 70),
(@stu1, @p2, @sci, @t2_2024, @ay2024, @rt_mid, 78),
(@stu1, @p2, @sst, @t2_2024, @ay2024, @rt_mid, 68),
(@stu1, @p2, @re, @t2_2024, @ay2024, @rt_mid, 82),
(@stu1, @p2, @math, @t2_2024, @ay2024, @rt_end, 80),
(@stu1, @p2, @eng, @t2_2024, @ay2024, @rt_end, 75),
(@stu1, @p2, @sci, @t2_2024, @ay2024, @rt_end, 82),
(@stu1, @p2, @sst, @t2_2024, @ay2024, @rt_end, 73),
(@stu1, @p2, @re, @t2_2024, @ay2024, @rt_end, 88)
ON DUPLICATE KEY UPDATE score = VALUES(score);

-- Term 3, 2024 - Mid & End
INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu1, @p2, @math, @t3_2024, @ay2024, @rt_mid, 76),
(@stu1, @p2, @eng, @t3_2024, @ay2024, @rt_mid, 73),
(@stu1, @p2, @sci, @t3_2024, @ay2024, @rt_mid, 80),
(@stu1, @p2, @sst, @t3_2024, @ay2024, @rt_mid, 71),
(@stu1, @p2, @re, @t3_2024, @ay2024, @rt_mid, 85),
(@stu1, @p2, @math, @t3_2024, @ay2024, @rt_end, 82),
(@stu1, @p2, @eng, @t3_2024, @ay2024, @rt_end, 78),
(@stu1, @p2, @sci, @t3_2024, @ay2024, @rt_end, 85),
(@stu1, @p2, @sst, @t3_2024, @ay2024, @rt_end, 76),
(@stu1, @p2, @re, @t3_2024, @ay2024, @rt_end, 90)
ON DUPLICATE KEY UPDATE score = VALUES(score);

-- ========== STUDENT 1: Ahmed — P3 in 2025 ==========
INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu1, @p3, @math, @t1_2025, @ay2025, @rt_mid, 70),
(@stu1, @p3, @eng, @t1_2025, @ay2025, @rt_mid, 65),
(@stu1, @p3, @sci, @t1_2025, @ay2025, @rt_mid, 72),
(@stu1, @p3, @sst, @t1_2025, @ay2025, @rt_mid, 60),
(@stu1, @p3, @re, @t1_2025, @ay2025, @rt_mid, 78),
(@stu1, @p3, @math, @t1_2025, @ay2025, @rt_end, 75),
(@stu1, @p3, @eng, @t1_2025, @ay2025, @rt_end, 70),
(@stu1, @p3, @sci, @t1_2025, @ay2025, @rt_end, 77),
(@stu1, @p3, @sst, @t1_2025, @ay2025, @rt_end, 66),
(@stu1, @p3, @re, @t1_2025, @ay2025, @rt_end, 83)
ON DUPLICATE KEY UPDATE score = VALUES(score);

INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu1, @p3, @math, @t2_2025, @ay2025, @rt_mid, 73),
(@stu1, @p3, @eng, @t2_2025, @ay2025, @rt_mid, 68),
(@stu1, @p3, @sci, @t2_2025, @ay2025, @rt_mid, 75),
(@stu1, @p3, @sst, @t2_2025, @ay2025, @rt_mid, 63),
(@stu1, @p3, @re, @t2_2025, @ay2025, @rt_mid, 80),
(@stu1, @p3, @math, @t2_2025, @ay2025, @rt_end, 79),
(@stu1, @p3, @eng, @t2_2025, @ay2025, @rt_end, 74),
(@stu1, @p3, @sci, @t2_2025, @ay2025, @rt_end, 80),
(@stu1, @p3, @sst, @t2_2025, @ay2025, @rt_end, 69),
(@stu1, @p3, @re, @t2_2025, @ay2025, @rt_end, 86)
ON DUPLICATE KEY UPDATE score = VALUES(score);

INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu1, @p3, @math, @t3_2025, @ay2025, @rt_mid, 78),
(@stu1, @p3, @eng, @t3_2025, @ay2025, @rt_mid, 72),
(@stu1, @p3, @sci, @t3_2025, @ay2025, @rt_mid, 79),
(@stu1, @p3, @sst, @t3_2025, @ay2025, @rt_mid, 68),
(@stu1, @p3, @re, @t3_2025, @ay2025, @rt_mid, 84),
(@stu1, @p3, @math, @t3_2025, @ay2025, @rt_end, 84),
(@stu1, @p3, @eng, @t3_2025, @ay2025, @rt_end, 78),
(@stu1, @p3, @sci, @t3_2025, @ay2025, @rt_end, 84),
(@stu1, @p3, @sst, @t3_2025, @ay2025, @rt_end, 74),
(@stu1, @p3, @re, @t3_2025, @ay2025, @rt_end, 90)
ON DUPLICATE KEY UPDATE score = VALUES(score);

-- ========== STUDENT 1: Ahmed — P4 in 2026 (current, Term 1 only) ==========
INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu1, @p4, @math, @t1_2026, @ay2026, @rt_mid, 68),
(@stu1, @p4, @eng, @t1_2026, @ay2026, @rt_mid, 63),
(@stu1, @p4, @sci, @t1_2026, @ay2026, @rt_mid, 70),
(@stu1, @p4, @sst, @t1_2026, @ay2026, @rt_mid, 58),
(@stu1, @p4, @re, @t1_2026, @ay2026, @rt_mid, 75)
ON DUPLICATE KEY UPDATE score = VALUES(score);

-- ========== STUDENT 2: Fatima — P1 in 2024 ==========
INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu2, @p1, @math, @t1_2024, @ay2024, @rt_mid, 85),
(@stu2, @p1, @eng, @t1_2024, @ay2024, @rt_mid, 90),
(@stu2, @p1, @sci, @t1_2024, @ay2024, @rt_mid, 82),
(@stu2, @p1, @sst, @t1_2024, @ay2024, @rt_mid, 88),
(@stu2, @p1, @re, @t1_2024, @ay2024, @rt_mid, 92),
(@stu2, @p1, @math, @t1_2024, @ay2024, @rt_end, 88),
(@stu2, @p1, @eng, @t1_2024, @ay2024, @rt_end, 93),
(@stu2, @p1, @sci, @t1_2024, @ay2024, @rt_end, 85),
(@stu2, @p1, @sst, @t1_2024, @ay2024, @rt_end, 90),
(@stu2, @p1, @re, @t1_2024, @ay2024, @rt_end, 95)
ON DUPLICATE KEY UPDATE score = VALUES(score);

INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu2, @p1, @math, @t2_2024, @ay2024, @rt_mid, 87),
(@stu2, @p1, @eng, @t2_2024, @ay2024, @rt_mid, 91),
(@stu2, @p1, @sci, @t2_2024, @ay2024, @rt_mid, 84),
(@stu2, @p1, @sst, @t2_2024, @ay2024, @rt_mid, 89),
(@stu2, @p1, @re, @t2_2024, @ay2024, @rt_mid, 93),
(@stu2, @p1, @math, @t2_2024, @ay2024, @rt_end, 90),
(@stu2, @p1, @eng, @t2_2024, @ay2024, @rt_end, 94),
(@stu2, @p1, @sci, @t2_2024, @ay2024, @rt_end, 87),
(@stu2, @p1, @sst, @t2_2024, @ay2024, @rt_end, 91),
(@stu2, @p1, @re, @t2_2024, @ay2024, @rt_end, 96)
ON DUPLICATE KEY UPDATE score = VALUES(score);

INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu2, @p1, @math, @t3_2024, @ay2024, @rt_mid, 89),
(@stu2, @p1, @eng, @t3_2024, @ay2024, @rt_mid, 92),
(@stu2, @p1, @sci, @t3_2024, @ay2024, @rt_mid, 86),
(@stu2, @p1, @sst, @t3_2024, @ay2024, @rt_mid, 90),
(@stu2, @p1, @re, @t3_2024, @ay2024, @rt_mid, 94),
(@stu2, @p1, @math, @t3_2024, @ay2024, @rt_end, 92),
(@stu2, @p1, @eng, @t3_2024, @ay2024, @rt_end, 95),
(@stu2, @p1, @sci, @t3_2024, @ay2024, @rt_end, 89),
(@stu2, @p1, @sst, @t3_2024, @ay2024, @rt_end, 93),
(@stu2, @p1, @re, @t3_2024, @ay2024, @rt_end, 97)
ON DUPLICATE KEY UPDATE score = VALUES(score);

-- ========== STUDENT 2: Fatima — P2 in 2025 ==========
INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu2, @p2, @math, @t1_2025, @ay2025, @rt_mid, 82),
(@stu2, @p2, @eng, @t1_2025, @ay2025, @rt_mid, 87),
(@stu2, @p2, @sci, @t1_2025, @ay2025, @rt_mid, 80),
(@stu2, @p2, @sst, @t1_2025, @ay2025, @rt_mid, 85),
(@stu2, @p2, @re, @t1_2025, @ay2025, @rt_mid, 90),
(@stu2, @p2, @math, @t1_2025, @ay2025, @rt_end, 86),
(@stu2, @p2, @eng, @t1_2025, @ay2025, @rt_end, 90),
(@stu2, @p2, @sci, @t1_2025, @ay2025, @rt_end, 83),
(@stu2, @p2, @sst, @t1_2025, @ay2025, @rt_end, 88),
(@stu2, @p2, @re, @t1_2025, @ay2025, @rt_end, 93)
ON DUPLICATE KEY UPDATE score = VALUES(score);

INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu2, @p2, @math, @t2_2025, @ay2025, @rt_mid, 84),
(@stu2, @p2, @eng, @t2_2025, @ay2025, @rt_mid, 88),
(@stu2, @p2, @sci, @t2_2025, @ay2025, @rt_mid, 82),
(@stu2, @p2, @sst, @t2_2025, @ay2025, @rt_mid, 86),
(@stu2, @p2, @re, @t2_2025, @ay2025, @rt_mid, 91),
(@stu2, @p2, @math, @t2_2025, @ay2025, @rt_end, 88),
(@stu2, @p2, @eng, @t2_2025, @ay2025, @rt_end, 91),
(@stu2, @p2, @sci, @t2_2025, @ay2025, @rt_end, 85),
(@stu2, @p2, @sst, @t2_2025, @ay2025, @rt_end, 89),
(@stu2, @p2, @re, @t2_2025, @ay2025, @rt_end, 94)
ON DUPLICATE KEY UPDATE score = VALUES(score);

INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu2, @p2, @math, @t3_2025, @ay2025, @rt_mid, 86),
(@stu2, @p2, @eng, @t3_2025, @ay2025, @rt_mid, 90),
(@stu2, @p2, @sci, @t3_2025, @ay2025, @rt_mid, 84),
(@stu2, @p2, @sst, @t3_2025, @ay2025, @rt_mid, 88),
(@stu2, @p2, @re, @t3_2025, @ay2025, @rt_mid, 92),
(@stu2, @p2, @math, @t3_2025, @ay2025, @rt_end, 90),
(@stu2, @p2, @eng, @t3_2025, @ay2025, @rt_end, 93),
(@stu2, @p2, @sci, @t3_2025, @ay2025, @rt_end, 87),
(@stu2, @p2, @sst, @t3_2025, @ay2025, @rt_end, 91),
(@stu2, @p2, @re, @t3_2025, @ay2025, @rt_end, 96)
ON DUPLICATE KEY UPDATE score = VALUES(score);

-- ========== STUDENT 2: Fatima — P3 in 2026 (current) ==========
INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu2, @p3, @math, @t1_2026, @ay2026, @rt_mid, 80),
(@stu2, @p3, @eng, @t1_2026, @ay2026, @rt_mid, 85),
(@stu2, @p3, @sci, @t1_2026, @ay2026, @rt_mid, 78),
(@stu2, @p3, @sst, @t1_2026, @ay2026, @rt_mid, 83),
(@stu2, @p3, @re, @t1_2026, @ay2026, @rt_mid, 88)
ON DUPLICATE KEY UPDATE score = VALUES(score);

-- ========== STUDENT 3: Ibrahim — P3 in 2024, P4 in 2025, P5 in 2026 ==========
-- 2024 Term 1-3
INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu3, @p3, @math, @t1_2024, @ay2024, @rt_mid, 55),
(@stu3, @p3, @eng, @t1_2024, @ay2024, @rt_mid, 50),
(@stu3, @p3, @sci, @t1_2024, @ay2024, @rt_mid, 48),
(@stu3, @p3, @sst, @t1_2024, @ay2024, @rt_mid, 52),
(@stu3, @p3, @re, @t1_2024, @ay2024, @rt_mid, 60),
(@stu3, @p3, @math, @t1_2024, @ay2024, @rt_end, 60),
(@stu3, @p3, @eng, @t1_2024, @ay2024, @rt_end, 55),
(@stu3, @p3, @sci, @t1_2024, @ay2024, @rt_end, 52),
(@stu3, @p3, @sst, @t1_2024, @ay2024, @rt_end, 57),
(@stu3, @p3, @re, @t1_2024, @ay2024, @rt_end, 65)
ON DUPLICATE KEY UPDATE score = VALUES(score);

INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu3, @p3, @math, @t2_2024, @ay2024, @rt_mid, 58),
(@stu3, @p3, @eng, @t2_2024, @ay2024, @rt_mid, 53),
(@stu3, @p3, @sci, @t2_2024, @ay2024, @rt_mid, 50),
(@stu3, @p3, @sst, @t2_2024, @ay2024, @rt_mid, 55),
(@stu3, @p3, @re, @t2_2024, @ay2024, @rt_mid, 63),
(@stu3, @p3, @math, @t2_2024, @ay2024, @rt_end, 63),
(@stu3, @p3, @eng, @t2_2024, @ay2024, @rt_end, 58),
(@stu3, @p3, @sci, @t2_2024, @ay2024, @rt_end, 55),
(@stu3, @p3, @sst, @t2_2024, @ay2024, @rt_end, 60),
(@stu3, @p3, @re, @t2_2024, @ay2024, @rt_end, 68)
ON DUPLICATE KEY UPDATE score = VALUES(score);

INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu3, @p3, @math, @t3_2024, @ay2024, @rt_mid, 60),
(@stu3, @p3, @eng, @t3_2024, @ay2024, @rt_mid, 56),
(@stu3, @p3, @sci, @t3_2024, @ay2024, @rt_mid, 53),
(@stu3, @p3, @sst, @t3_2024, @ay2024, @rt_mid, 58),
(@stu3, @p3, @re, @t3_2024, @ay2024, @rt_mid, 66),
(@stu3, @p3, @math, @t3_2024, @ay2024, @rt_end, 66),
(@stu3, @p3, @eng, @t3_2024, @ay2024, @rt_end, 61),
(@stu3, @p3, @sci, @t3_2024, @ay2024, @rt_end, 58),
(@stu3, @p3, @sst, @t3_2024, @ay2024, @rt_end, 63),
(@stu3, @p3, @re, @t3_2024, @ay2024, @rt_end, 72)
ON DUPLICATE KEY UPDATE score = VALUES(score);

-- 2025 Term 1-3
INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu3, @p4, @math, @t1_2025, @ay2025, @rt_mid, 62),
(@stu3, @p4, @eng, @t1_2025, @ay2025, @rt_mid, 58),
(@stu3, @p4, @sci, @t1_2025, @ay2025, @rt_mid, 55),
(@stu3, @p4, @sst, @t1_2025, @ay2025, @rt_mid, 60),
(@stu3, @p4, @re, @t1_2025, @ay2025, @rt_mid, 68),
(@stu3, @p4, @math, @t1_2025, @ay2025, @rt_end, 68),
(@stu3, @p4, @eng, @t1_2025, @ay2025, @rt_end, 63),
(@stu3, @p4, @sci, @t1_2025, @ay2025, @rt_end, 60),
(@stu3, @p4, @sst, @t1_2025, @ay2025, @rt_end, 65),
(@stu3, @p4, @re, @t1_2025, @ay2025, @rt_end, 73)
ON DUPLICATE KEY UPDATE score = VALUES(score);

INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu3, @p4, @math, @t2_2025, @ay2025, @rt_mid, 65),
(@stu3, @p4, @eng, @t2_2025, @ay2025, @rt_mid, 60),
(@stu3, @p4, @sci, @t2_2025, @ay2025, @rt_mid, 58),
(@stu3, @p4, @sst, @t2_2025, @ay2025, @rt_mid, 63),
(@stu3, @p4, @re, @t2_2025, @ay2025, @rt_mid, 70),
(@stu3, @p4, @math, @t2_2025, @ay2025, @rt_end, 70),
(@stu3, @p4, @eng, @t2_2025, @ay2025, @rt_end, 66),
(@stu3, @p4, @sci, @t2_2025, @ay2025, @rt_end, 63),
(@stu3, @p4, @sst, @t2_2025, @ay2025, @rt_end, 68),
(@stu3, @p4, @re, @t2_2025, @ay2025, @rt_end, 75)
ON DUPLICATE KEY UPDATE score = VALUES(score);

INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu3, @p4, @math, @t3_2025, @ay2025, @rt_mid, 68),
(@stu3, @p4, @eng, @t3_2025, @ay2025, @rt_mid, 63),
(@stu3, @p4, @sci, @t3_2025, @ay2025, @rt_mid, 60),
(@stu3, @p4, @sst, @t3_2025, @ay2025, @rt_mid, 65),
(@stu3, @p4, @re, @t3_2025, @ay2025, @rt_mid, 72),
(@stu3, @p4, @math, @t3_2025, @ay2025, @rt_end, 73),
(@stu3, @p4, @eng, @t3_2025, @ay2025, @rt_end, 68),
(@stu3, @p4, @sci, @t3_2025, @ay2025, @rt_end, 65),
(@stu3, @p4, @sst, @t3_2025, @ay2025, @rt_end, 70),
(@stu3, @p4, @re, @t3_2025, @ay2025, @rt_end, 78)
ON DUPLICATE KEY UPDATE score = VALUES(score);

-- 2026 Term 1 (current)
INSERT INTO `class_results` (`student_id`, `class_id`, `subject_id`, `term_id`, `academic_year_id`, `result_type_id`, `score`) VALUES
(@stu3, @p5, @math, @t1_2026, @ay2026, @rt_mid, 65),
(@stu3, @p5, @eng, @t1_2026, @ay2026, @rt_mid, 60),
(@stu3, @p5, @sci, @t1_2026, @ay2026, @rt_mid, 58),
(@stu3, @p5, @sst, @t1_2026, @ay2026, @rt_mid, 62),
(@stu3, @p5, @re, @t1_2026, @ay2026, @rt_mid, 70)
ON DUPLICATE KEY UPDATE score = VALUES(score);

-- ============================================
-- SECTION 9: REPORT CARDS FOR HISTORICAL YEARS
-- Generate report_cards entries with comments
-- ============================================

-- Student 1: Ahmed — P2 Term 1 2024
INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu1, @t1_2024, @ay2024, @p2, 'C3',
  'Ahmed is a dedicated student. He works hard and shows improvement.',
  'Good performance. Keep up the effort.',
  'Satisfactory. Encourage more reading.',
  '2024-05-03', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu1 AND `term_id` = @t1_2024);

INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu1, @t2_2024, @ay2024, @p2, 'C3',
  'Steady improvement shown in all areas. Very cooperative in class.',
  'We are pleased with your consistent improvement.',
  'Good progress. Continue working hard.',
  '2024-08-23', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu1 AND `term_id` = @t2_2024);

INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu1, @t3_2024, @ay2024, @p2, 'D2',
  'Excellent end of year performance. Ready for promotion.',
  'Congratulations on a wonderful year!',
  'Promoted to Primary 3. Well done!',
  '2024-11-29', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu1 AND `term_id` = @t3_2024);

-- Student 1: P3 2025 reports
INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu1, @t1_2025, @ay2025, @p3, 'C3',
  'Ahmed is adjusting well to Primary 3. Good effort in all subjects.',
  'Encouraging start to the year.',
  'Needs to focus more on English and Social Studies.',
  '2025-05-02', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu1 AND `term_id` = @t1_2025);

INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu1, @t2_2025, @ay2025, @p3, 'C3',
  'Improvements noted. Ahmed participates actively in class.',
  'Good term. Keep it up.',
  'Consistent performer across all subjects.',
  '2025-08-22', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu1 AND `term_id` = @t2_2025);

INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu1, @t3_2025, @ay2025, @p3, 'D2',
  'Outstanding final term. Ahmed has matured academically.',
  'Well done Ahmed! Promoted to Primary 4.',
  'Promoted. Expect even better results next year.',
  '2025-11-28', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu1 AND `term_id` = @t3_2025);

-- Student 2: Fatima — P1 2024 reports
INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu2, @t1_2024, @ay2024, @p1, 'D1',
  'Fatima is an exceptional student. Highest marks in class.',
  'Remarkable performance! A role model for others.',
  'Keep excelling, Fatima.',
  '2024-05-03', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu2 AND `term_id` = @t1_2024);

INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu2, @t2_2024, @ay2024, @p1, 'D1',
  'Continues to lead the class. Outstanding in all subjects.',
  'We are very proud of your achievements.',
  'Top performer. Keep up the excellent work.',
  '2024-08-23', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu2 AND `term_id` = @t2_2024);

INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu2, @t3_2024, @ay2024, @p1, 'D1',
  'Perfect end to the year. Fatima excelled in every area.',
  'Brilliant work! Promoted with distinction.',
  'Best student in Primary 1. Promoted to Primary 2.',
  '2024-11-29', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu2 AND `term_id` = @t3_2024);

-- Student 2: P2 2025 reports
INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu2, @t1_2025, @ay2025, @p2, 'D1',
  'Fatima continues to excel in Primary 2. Strong across all subjects.',
  'Outstanding performance as always.',
  'Top of the class. Keep it up.',
  '2025-05-02', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu2 AND `term_id` = @t1_2025);

INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu2, @t2_2025, @ay2025, @p2, 'D1',
  'Another strong term. Fatima is a natural leader in class.',
  'Excellent term. We are proud of you.',
  'Consistent excellence. A star student.',
  '2025-08-22', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu2 AND `term_id` = @t2_2025);

INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu2, @t3_2025, @ay2025, @p2, 'D1',
  'Perfect year-end performance! Fatima is promoted to Primary 3.',
  'Exceptional year! We look forward to your continued success.',
  'Number 1 in class. Promoted with highest honors.',
  '2025-11-28', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu2 AND `term_id` = @t3_2025);

-- Student 3: Ibrahim — P3 2024 reports
INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu3, @t1_2024, @ay2024, @p3, 'C5',
  'Ibrahim needs to put in more effort. Struggling in Science.',
  'We encourage Ibrahim to seek extra help in weak subjects.',
  'Below average. More reading and practice needed.',
  '2024-05-03', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu3 AND `term_id` = @t1_2024);

INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu3, @t2_2024, @ay2024, @p3, 'C5',
  'Slight improvement but still needs more work. Try harder Ibrahim.',
  'Showing effort but results need to improve.',
  'Encourage home study and tutoring.',
  '2024-08-23', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu3 AND `term_id` = @t2_2024);

INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu3, @t3_2024, @ay2024, @p3, 'C4',
  'Good improvement at end of year. Ibrahim has worked hard.',
  'Promoted to Primary 4. We expect better results.',
  'Promoted. Continue improving.',
  '2024-11-29', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu3 AND `term_id` = @t3_2024);

-- Student 3: P4 2025 reports
INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu3, @t1_2025, @ay2025, @p4, 'C4',
  'Ibrahim is showing steady growth. Keep pushing hard.',
  'Encouraging progress noted in this term.',
  'Improvement seen. Continue on this path.',
  '2025-05-02', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu3 AND `term_id` = @t1_2025);

INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu3, @t2_2025, @ay2025, @p4, 'C4',
  'Consistent effort this term. Ibrahim is more focused.',
  'Good progress. We are hopeful for the final term.',
  'Average performance but improving trend is positive.',
  '2025-08-22', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu3 AND `term_id` = @t2_2025);

INSERT INTO `report_cards` (`student_id`, `term_id`, `academic_year_id`, `class_id`, `overall_grade`, `class_teacher_comment`, `headteacher_comment`, `dos_comment`, `report_date`, `status`)
SELECT @stu3, @t3_2025, @ay2025, @p4, 'C3',
  'Best term yet for Ibrahim! Real progress made.',
  'Promoted to Primary 5. Well done!',
  'Good improvement. Promoted. Keep it up in P5.',
  '2025-11-28', 'published'
FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM `report_cards` WHERE `student_id` = @stu3 AND `term_id` = @t3_2025);

-- ============================================
-- SECTION 10: REPORT CARD METRICS
-- ============================================

-- We'll compute metrics for each report card after the cards are created
-- This needs to be done programmatically since it relies on inserted IDs
-- The report card generation API handles this automatically

-- ============================================
-- TEST DATA COMPLETE
-- ============================================
-- Summary:
-- 3 test students (TEST-001, TEST-002, TEST-003)
-- 3 academic years (2024, 2025, 2026) with 3 terms each
-- Full enrollment history per student across years
-- Promotion records for each year transition
-- Class results: 5 subjects × (mid + end) × 3 terms × 2-3 years
-- Report cards with comments for all completed terms
-- ============================================
