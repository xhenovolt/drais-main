-- ============================================
-- ALBAYAN DATA VALIDATION QUERIES
-- Run AFTER applying ALBAYAN_MIGRATION_2026.sql
-- ============================================

-- =====================
-- 1. STUDENT RECORDS VALIDATION
-- =====================

-- Count total students
SELECT 'Total Students' AS validation, COUNT(*) AS count FROM students;

-- Count active students
SELECT 'Active Students' AS validation, COUNT(*) AS count FROM students WHERE status = 'active' AND deleted_at IS NULL;

-- Count students with person records (should match total)
SELECT 'Students WITH person record' AS validation, COUNT(*) AS count 
FROM students s JOIN people p ON s.person_id = p.id;

-- Orphaned students (person_id not found)
SELECT 'ORPHANED students (missing person)' AS validation, COUNT(*) AS count 
FROM students s LEFT JOIN people p ON s.person_id = p.id WHERE p.id IS NULL;

-- Students without school_id
SELECT 'Students missing school_id' AS validation, COUNT(*) AS count 
FROM students WHERE school_id IS NULL;

-- =====================
-- 2. CLASS VALIDATION
-- =====================

-- Total classes
SELECT 'Total Classes' AS validation, COUNT(*) AS count FROM classes;

-- Classes with levels assigned
SELECT 'Classes WITH level' AS validation, COUNT(*) AS count FROM classes WHERE level IS NOT NULL;

-- List all classes
SELECT id, name, level, code, school_id FROM classes ORDER BY level;

-- =====================
-- 3. ENROLLMENT VALIDATION
-- =====================

-- Total enrollments
SELECT 'Total Enrollments' AS validation, COUNT(*) AS count FROM enrollments;

-- Active enrollments
SELECT 'Active Enrollments' AS validation, COUNT(*) AS count FROM enrollments WHERE status = 'active';

-- Orphaned enrollments (student not found)
SELECT 'ORPHANED enrollments (missing student)' AS validation, COUNT(*) AS count 
FROM enrollments e LEFT JOIN students s ON e.student_id = s.id WHERE s.id IS NULL;

-- Orphaned enrollments (class not found)
SELECT 'ORPHANED enrollments (missing class)' AS validation, COUNT(*) AS count 
FROM enrollments e LEFT JOIN classes c ON e.class_id = c.id WHERE c.id IS NULL AND e.class_id IS NOT NULL;

-- Enrollment distribution by class
SELECT c.name AS class_name, COUNT(e.id) AS student_count 
FROM enrollments e JOIN classes c ON e.class_id = c.id 
WHERE e.status = 'active'
GROUP BY c.name ORDER BY c.id;

-- =====================
-- 4. RESULTS VALIDATION
-- =====================

-- Total class_results
SELECT 'Total class_results' AS validation, COUNT(*) AS count FROM class_results;

-- Orphaned results (student not found)
SELECT 'ORPHANED results (missing student)' AS validation, COUNT(*) AS count 
FROM class_results cr LEFT JOIN students s ON cr.student_id = s.id WHERE s.id IS NULL;

-- Orphaned results (class not found)
SELECT 'ORPHANED results (missing class)' AS validation, COUNT(*) AS count 
FROM class_results cr LEFT JOIN classes c ON cr.class_id = c.id WHERE c.id IS NULL;

-- Results distribution by class
SELECT c.name AS class_name, COUNT(cr.id) AS result_count 
FROM class_results cr JOIN classes c ON cr.class_id = c.id 
GROUP BY c.name ORDER BY c.id;

-- =====================
-- 5. SUBJECTS VALIDATION
-- =====================

SELECT 'Total Subjects' AS validation, COUNT(*) AS count FROM subjects;
SELECT id, name, code, subject_type FROM subjects ORDER BY id;

-- =====================
-- 6. AUTH TABLES VALIDATION
-- =====================

-- Users table exists and has super admin
SELECT 'Users count' AS validation, COUNT(*) AS count FROM users;
SELECT 'Super Admin exists' AS validation, COUNT(*) AS count FROM users WHERE email = 'superadmin@albayan.com' AND is_active = TRUE;

-- Roles exist
SELECT 'Roles count' AS validation, COUNT(*) AS count FROM roles WHERE school_id = 1;

-- User roles assigned
SELECT 'User-Role assignments' AS validation, COUNT(*) AS count FROM user_roles;

-- Sessions table exists
SELECT 'Sessions table ready' AS validation, COUNT(*) AS count FROM sessions;

-- =====================
-- 7. TABLE EXISTENCE CHECK
-- =====================

SELECT 'terms table' AS validation, COUNT(*) AS count FROM terms;
SELECT 'security_settings table' AS validation, COUNT(*) AS count FROM security_settings;
SELECT 'sessions table' AS validation, COUNT(*) AS count FROM sessions;
SELECT 'user_roles table' AS validation, COUNT(*) AS count FROM user_roles;
SELECT 'audit_logs table' AS validation, COUNT(*) AS count FROM audit_logs;

-- =====================
-- 8. SCHOOL DATA INTEGRITY
-- =====================

SELECT 'Schools count' AS validation, COUNT(*) AS count FROM schools;
SELECT id, name, short_code, status FROM schools;
SELECT 'School info count' AS validation, COUNT(*) AS count FROM school_info WHERE school_id = 1;

-- =====================
-- VALIDATION COMPLETE
-- =====================
