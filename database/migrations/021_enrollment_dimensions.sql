-- Migration 021: Add multi-dimensional enrollment columns
-- Adds curriculum_id and program_id directly to enrollments table
-- Part of the architectural redesign: Student → Class + Stream + Program + Study Mode + Curriculum
-- Applied: 2026-04-01

-- 1. Add curriculum_id (references curriculums.id — global table, no school_id)
ALTER TABLE enrollments ADD COLUMN curriculum_id TINYINT NULL AFTER study_mode_id;
ALTER TABLE enrollments ADD INDEX idx_enrollments_curriculum (curriculum_id);

-- 2. Add program_id (references programs.id — school-scoped)
ALTER TABLE enrollments ADD COLUMN program_id BIGINT NULL AFTER curriculum_id;
ALTER TABLE enrollments ADD INDEX idx_enrollments_program (program_id);

-- 3. Record migration
INSERT INTO migration_runs (migration_name, status, started_at, completed_at)
VALUES ('021_enrollment_dimensions', 'completed', NOW(), NOW());
