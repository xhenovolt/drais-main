-- Fix AUTO_INCREMENT for people and students tables
-- This fixes the student admission issue

-- Fix people table
ALTER TABLE `people` MODIFY COLUMN `id` BIGINT(20) NOT NULL AUTO_INCREMENT;

-- Fix students table  
ALTER TABLE `students` MODIFY COLUMN `id` BIGINT(20) NOT NULL AUTO_INCREMENT;

-- Fix contacts table
ALTER TABLE `contacts` MODIFY COLUMN `id` BIGINT(20) NOT NULL AUTO_INCREMENT;

-- Fix student_contacts table
ALTER TABLE `student_contacts` MODIFY COLUMN `id` BIGINT(20) NOT NULL AUTO_INCREMENT;

-- Fix enrollments table
ALTER TABLE `enrollments` MODIFY COLUMN `id` BIGINT(20) NOT NULL AUTO_INCREMENT;

-- Fix student_fee_items table
ALTER TABLE `student_fee_items` MODIFY COLUMN `id` BIGINT(20) NOT NULL AUTO_INCREMENT;

-- Add academic year if not exists
INSERT INTO academic_years (school_id, name, start_date, end_date, status) 
SELECT 1, '2025', '2025-01-01', '2025-12-31', 'active'
WHERE NOT EXISTS (SELECT 1 FROM academic_years WHERE name = '2025');

-- Add term if not exists
INSERT INTO terms (school_id, name, academic_year_id, start_date, end_date, status)
SELECT 1, 'Term 1', (SELECT id FROM academic_years WHERE name = '2025' LIMIT 1), '2025-01-01', '2025-04-30', 'active'
WHERE NOT EXISTS (SELECT 1 FROM terms WHERE name = 'Term 1');