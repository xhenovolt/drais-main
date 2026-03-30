-- =============================================================
-- DRAIS Staff Module Schema Fix Migration
-- Generated: 2025
-- Purpose: Align DB with corrected API code assumptions
--
-- KEY FACTS (do NOT revert):
--   users.person_id  = FK to people.id  (NOT users.staff_id)
--   staff.person_id  = FK to people.id
--   User <-> Staff link: users.person_id = staff.person_id
--   device_user_mappings has SEPARATE staff_id and student_id
-- =============================================================

-- 1. Ensure users.person_id column exists (it should; this is a safety guard)
ALTER TABLE users
  MODIFY COLUMN person_id BIGINT DEFAULT NULL;

-- 2. Index for fast user<->staff JOINs via person_id
CREATE INDEX IF NOT EXISTS idx_users_person_id
  ON users(person_id);

CREATE INDEX IF NOT EXISTS idx_users_school_person
  ON users(school_id, person_id);

-- 3. Ensure device_user_mappings has explicit, separate staff_id and student_id
--    (Both are NULLABLE — a mapping is for either a student OR a staff member)
ALTER TABLE device_user_mappings
  MODIFY COLUMN student_id BIGINT NULL DEFAULT NULL,
  MODIFY COLUMN staff_id   BIGINT NULL DEFAULT NULL;

-- 4. Composite index for the corrected JOIN pattern on device_user_mappings
CREATE INDEX IF NOT EXISTS idx_dum_staff_school
  ON device_user_mappings(staff_id, school_id);

CREATE INDEX IF NOT EXISTS idx_dum_student_school
  ON device_user_mappings(student_id, school_id);

-- 5. Ensure people.date_of_birth (NOT dob) is the canonical column
--    (Legacy code used 'dob'; API now selects p.date_of_birth AS dob)
ALTER TABLE people
  MODIFY COLUMN date_of_birth DATE NULL DEFAULT NULL;

-- 6. Ensure users.status is the canonical account state column
--    (Legacy code referenced users.is_active; it does not exist)
ALTER TABLE users
  MODIFY COLUMN status ENUM('active','inactive','suspended','locked') NOT NULL DEFAULT 'active';

-- 7. Safety: Remove users.staff_id if it somehow exists in this DB
--    (IbunNew.sql confirms no staff_id column; this is defensive cleanup)
-- SET @col_exists = (
--   SELECT COUNT(*) FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'staff_id'
-- );
-- Uncomment and run manually if needed:
-- ALTER TABLE users DROP COLUMN IF EXISTS staff_id;

-- =============================================================
-- VERIFICATION QUERIES (run after migration to confirm)
-- =============================================================
-- Check users has person_id:
--   DESCRIBE users;
--
-- Check JOIN works:
--   SELECT s.id, s.staff_no, u.id AS user_id, u.username
--   FROM staff s
--   LEFT JOIN users u ON u.person_id = s.person_id AND u.school_id = s.school_id
--   LIMIT 5;
--
-- Check device mappings:
--   SELECT id, staff_id, student_id FROM device_user_mappings LIMIT 5;
-- =============================================================
