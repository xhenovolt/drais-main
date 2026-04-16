-- Phase 4: Hard Delete Architecture
-- Add soft delete (deleted_at) columns to critical tables
-- These columns support soft deletion with audit logging instead of hard deletes

-- Students module (already has deleted_at, verify it's consistent)
ALTER TABLE IF EXISTS students ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;

-- Staff module (already has deleted_at, verify it's consistent)
ALTER TABLE IF EXISTS staff ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;

-- Academic module - CRITICAL
ALTER TABLE IF EXISTS classes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS subjects ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS academic_years ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS streams ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;

-- Results and Assessment
ALTER TABLE IF EXISTS class_results ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS result_types ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS class_result_weights ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;

-- Timetable and Scheduling
ALTER TABLE IF EXISTS timetable_entries ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS timetable_periods ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE IF EXISTS timetable_metadata ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;

-- Examinations
ALTER TABLE IF EXISTS exams ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS exam_groups ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE IF EXISTS exam_results ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;

-- Curriculum and Content
ALTER TABLE IF EXISTS curriculums ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS competencies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE IF EXISTS learning_outcomes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;

-- Tahfiz Module
ALTER TABLE IF EXISTS tahfiz_students ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS tahfiz_classes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS tahfiz_results ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS tahfiz_assessments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;

-- Finance Module - CRITICAL for compliance
ALTER TABLE IF EXISTS salary_payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS salary_definitions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE IF EXISTS payroll_definitions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE IF EXISTS finance_waivers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;

-- Inventory
ALTER TABLE IF EXISTS inventory_items ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS inventory_transactions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;

-- Other critical tables
ALTER TABLE IF EXISTS departments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS roles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS enrollments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;
ALTER TABLE IF EXISTS devices ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE IF EXISTS workplans ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER status;

-- Create indexes for soft-deleted record filtering (performance optimization)
-- These indexes help efficiently query active records (deleted_at IS NULL)
ALTER TABLE students ADD INDEX IF NOT EXISTS idx_students_deleted_at (deleted_at);
ALTER TABLE staff ADD INDEX IF NOT EXISTS idx_staff_deleted_at (deleted_at);
ALTER TABLE classes ADD INDEX IF NOT EXISTS idx_classes_deleted_at (deleted_at);
ALTER TABLE subjects ADD INDEX IF NOT EXISTS idx_subjects_deleted_at (deleted_at);
ALTER TABLE class_results ADD INDEX IF NOT EXISTS idx_class_results_deleted_at (deleted_at);
ALTER TABLE timetable_entries ADD INDEX IF NOT EXISTS idx_timetable_entries_deleted_at (deleted_at);
ALTER TABLE exams ADD INDEX IF NOT EXISTS idx_exams_deleted_at (deleted_at);
ALTER TABLE enrollments ADD INDEX IF NOT EXISTS idx_enrollments_deleted_at (deleted_at);
ALTER TABLE salary_payments ADD INDEX IF NOT EXISTS idx_salary_payments_deleted_at (deleted_at);

-- NOTE: All DELETE operations should now:
-- 1. Set deleted_at = CURRENT_TIMESTAMP instead of removing rows
-- 2. Call logAudit() with DELETED_* action
-- 3. This ensures data recovery and audit trail integrity
