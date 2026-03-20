-- ============================================================
-- DRAIS PHASE 1 REBUILD — ENROLLMENT ARCHITECTURE MIGRATION
-- Version: 1.0
-- Date: 2026-03-20
-- Description: Hardens enrollment system, adds missing columns,
--              creates migration_log, and seeds default data.
-- ============================================================
-- SAFETY: Run inside a transaction. Back up before executing.
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET @migration_start = NOW();

-- ============================================================
-- STEP 0: MIGRATION LOG TABLE (PHASE 0)
-- ============================================================

CREATE TABLE IF NOT EXISTS migration_log (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  action      VARCHAR(255) NOT NULL COMMENT 'Description of change made',
  applied_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'When the migration ran',
  status      ENUM('applied', 'skipped', 'failed') DEFAULT 'applied',
  details     TEXT DEFAULT NULL,
  INDEX idx_applied_at (applied_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Tracks every structural change to the schema';

INSERT INTO migration_log (action) VALUES ('migration_log table created – Phase 1 start');

-- ============================================================
-- STEP 1: STREAMS TABLE (ensure it exists)
-- ============================================================

CREATE TABLE IF NOT EXISTS streams (
  id          BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id   BIGINT NOT NULL DEFAULT 1,
  class_id    BIGINT DEFAULT NULL COMMENT 'Optional – stream within a class',
  name        VARCHAR(100) NOT NULL,
  code        VARCHAR(20) DEFAULT NULL,
  capacity    INT DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at  TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_school_id (school_id),
  INDEX idx_class_id (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Class streams / sub-divisions';

INSERT INTO migration_log (action) VALUES ('streams table ensured');

-- ============================================================
-- STEP 2: ENHANCE ENROLLMENTS TABLE
-- ============================================================

-- Add enrollment_type if missing
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS enrollment_type
    ENUM('new','continuing','transfer','repeat') NOT NULL DEFAULT 'new'
    COMMENT 'Type of enrollment' AFTER term_id;

-- Add joined_at if missing
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS joined_at DATE DEFAULT NULL
    COMMENT 'Date student joined this enrollment' AFTER enrollment_type;

-- Add enrollment_date if missing  
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS enrollment_date DATE DEFAULT NULL
    COMMENT 'Official enrollment date' AFTER joined_at;

-- Add end_date if missing
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS end_date DATE DEFAULT NULL
    COMMENT 'Date enrollment ended (transfer, complete, drop)' AFTER enrollment_date;

-- Add end_reason if missing
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS end_reason VARCHAR(100) DEFAULT NULL
    COMMENT 'Reason enrollment ended' AFTER end_date;

-- Add created_at / updated_at / deleted_at if missing
ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER end_reason;

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ON UPDATE CURRENT_TIMESTAMP AFTER created_at;

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;

-- ============================================================
-- STEP 2b: Robust indexes on enrollments
-- ============================================================

-- student_id index
ALTER TABLE enrollments
  ADD INDEX IF NOT EXISTS idx_student_id (student_id);

-- term_id index  
ALTER TABLE enrollments
  ADD INDEX IF NOT EXISTS idx_term_id (term_id);

-- academic_year_id index
ALTER TABLE enrollments
  ADD INDEX IF NOT EXISTS idx_academic_year_id (academic_year_id);

-- composite: school + student + term (fast current-term lookup)
ALTER TABLE enrollments
  ADD INDEX IF NOT EXISTS idx_school_student_term (school_id, student_id, term_id);

-- composite: school + class + term (class roster)
ALTER TABLE enrollments
  ADD INDEX IF NOT EXISTS idx_school_class_term (school_id, class_id, term_id);

INSERT INTO migration_log (action) VALUES ('enrollments table enhanced – enrollment_type, joined_at, end_date, end_reason, timestamps, indexes');

-- ============================================================
-- STEP 3: ENSURE people TABLE EXISTS (some setups use persons)
-- ============================================================
-- The codebase uses both "people" and "persons" — create "people"
-- as the canonical table and leave "persons" as an alias/synonym.

CREATE TABLE IF NOT EXISTS people (
  id           BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id    BIGINT DEFAULT NULL,
  first_name   VARCHAR(100) NOT NULL,
  last_name    VARCHAR(100) NOT NULL,
  other_name   VARCHAR(100) DEFAULT NULL,
  gender       ENUM('male','female','other','not_specified') DEFAULT 'not_specified',
  date_of_birth DATE DEFAULT NULL,
  phone        VARCHAR(20) DEFAULT NULL,
  email        VARCHAR(150) DEFAULT NULL,
  photo_url    VARCHAR(500) DEFAULT NULL,
  national_id  VARCHAR(50) DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at   TIMESTAMP NULL DEFAULT NULL,
  INDEX idx_first_name (first_name),
  INDEX idx_last_name (last_name),
  INDEX idx_school_id (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci
  COMMENT='Core person records (canonical name: people)';

-- Add photo_url to persons if using that table
ALTER TABLE persons ADD COLUMN IF NOT EXISTS photo_url VARCHAR(500) DEFAULT NULL AFTER email;

INSERT INTO migration_log (action) VALUES ('people table ensured with photo_url');

-- ============================================================
-- STEP 4: ENSURE students.class_id IS NOT THE CANONICAL SOURCE
-- We do NOT remove the column (to avoid breaking legacy code),
-- but we add a comment marking it deprecated.
-- The column will be phased out after enrollment backfill.
-- ============================================================

ALTER TABLE students
  MODIFY COLUMN IF EXISTS class_id BIGINT DEFAULT NULL
    COMMENT '[DEPRECATED] Use enrollments.class_id instead';

INSERT INTO migration_log (action) VALUES ('students.class_id marked deprecated – canonical class is enrollments.class_id');

-- ============================================================
-- STEP 5: TERMS TABLE — ensure start_date / end_date exist
-- ============================================================

ALTER TABLE terms
  ADD COLUMN IF NOT EXISTS start_date DATE DEFAULT NULL AFTER name;

ALTER TABLE terms
  ADD COLUMN IF NOT EXISTS end_date DATE DEFAULT NULL AFTER start_date;

-- Add dates index for getCurrentTerm() query
ALTER TABLE terms
  ADD INDEX IF NOT EXISTS idx_dates (start_date, end_date);

INSERT INTO migration_log (action) VALUES ('terms.start_date / end_date ensured with index');

-- ============================================================
-- STEP 6: DEFAULT ACADEMIC YEAR + TERM SEED DATA
-- Creates 2025 academic year and Term 1 if none exist.
-- ============================================================

INSERT INTO academic_years (school_id, name, start_date, end_date, status)
SELECT 1, '2025', '2025-02-01', '2025-11-30', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM academic_years WHERE school_id = 1 AND name = '2025'
);

SET @year_id = (
  SELECT id FROM academic_years WHERE school_id = 1 AND name = '2025' LIMIT 1
);

INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, status)
SELECT 1, @year_id, 'Term 1', '2025-02-01', '2025-04-30', 'active'
WHERE @year_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM terms WHERE academic_year_id = @year_id AND name = 'Term 1'
  );

INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, status)
SELECT 1, @year_id, 'Term 2', '2025-05-15', '2025-08-31', 'draft'
WHERE @year_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM terms WHERE academic_year_id = @year_id AND name = 'Term 2'
  );

INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, status)
SELECT 1, @year_id, 'Term 3', '2025-09-15', '2025-11-30', 'draft'
WHERE @year_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM terms WHERE academic_year_id = @year_id AND name = 'Term 3'
  );

-- 2026 academic year
INSERT INTO academic_years (school_id, name, start_date, end_date, status)
SELECT 1, '2026', '2026-02-01', '2026-11-30', 'active'
WHERE NOT EXISTS (
  SELECT 1 FROM academic_years WHERE school_id = 1 AND name = '2026'
);

SET @year_2026 = (
  SELECT id FROM academic_years WHERE school_id = 1 AND name = '2026' LIMIT 1
);

INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, status)
SELECT 1, @year_2026, 'Term 1', '2026-02-01', '2026-04-30', 'active'
WHERE @year_2026 IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM terms WHERE academic_year_id = @year_2026 AND name = 'Term 1'
  );

INSERT INTO migration_log (action) VALUES ('default academic years (2025, 2026) and terms seeded');

-- ============================================================
-- STEP 7: BACKFILL ENROLLMENTS FROM students.class_id
-- For students who have a class_id but NO active enrollment,
-- create an enrollment record pointing to 2025/Term1.
-- This prevents data loss.
-- ============================================================

SET @term_id = (
  SELECT t.id
  FROM terms t
  JOIN academic_years ay ON t.academic_year_id = ay.id
  WHERE ay.school_id = 1 AND t.status = 'active'
  ORDER BY t.start_date DESC
  LIMIT 1
);

SET @ay_id = (
  SELECT ay.id
  FROM academic_years ay
  WHERE ay.school_id = 1 AND ay.status = 'active'
  ORDER BY ay.start_date DESC
  LIMIT 1
);

INSERT INTO enrollments
  (school_id, student_id, class_id, academic_year_id, term_id,
   enrollment_type, status, joined_at, enrollment_date, created_at)
SELECT
  s.school_id,
  s.id           AS student_id,
  s.class_id     AS class_id,
  @ay_id         AS academic_year_id,
  @term_id       AS term_id,
  'continuing'   AS enrollment_type,
  'active'       AS status,
  s.admission_date,
  s.admission_date,
  NOW()
FROM students s
WHERE s.class_id IS NOT NULL
  AND s.deleted_at IS NULL
  AND s.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM enrollments e
    WHERE e.student_id = s.id
      AND e.status = 'active'
      AND e.school_id = s.school_id
  );

INSERT INTO migration_log (action, details)
VALUES (
  'enrollment backfill complete',
  CONCAT('Backfilled students without active enrollment using class_id. active_term_id=',
    IFNULL(@term_id, 'NULL'), ', ay_id=', IFNULL(@ay_id, 'NULL'))
);

-- ============================================================
-- STEP 8: VALIDATION REPORT
-- ============================================================

SELECT
  'student_count'   AS metric,
  COUNT(*)          AS value
FROM students
WHERE deleted_at IS NULL AND status = 'active'
UNION ALL
SELECT
  'enrollment_count',
  COUNT(*)
FROM enrollments
WHERE deleted_at IS NULL AND status = 'active'
UNION ALL
SELECT
  'students_without_enrollment',
  COUNT(*)
FROM students s
WHERE s.deleted_at IS NULL
  AND s.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM enrollments e
    WHERE e.student_id = s.id AND e.status = 'active'
  );

INSERT INTO migration_log (action)
VALUES ('Phase 1 migration complete – validation report printed above');

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- END OF PHASE 1 MIGRATION
-- ============================================================
