-- ============================================================================
-- DRAIS V1 — Migration 020: Fix enrollments table + notification templates
-- Date: 2026-03-21
-- Safe to run multiple times (IF NOT EXISTS / IF EXISTS guards)
--
-- ROOT CAUSE: enrollments table is missing schema columns that the application
-- queries expect (school_id, deleted_at, enrollment_date, enrollment_type,
-- joined_at, updated_at). This causes:
--   - "Unknown column 'e.school_id'" → enrolled list empty
--   - "Unknown column 'e.deleted_at'" → admitted + enrolled list empty
--   - INSERT errors when creating enrollments via POST /api/students
-- ============================================================================

-- ============================================================================
-- BLOCK 1: enrollments — add all missing columns
-- ============================================================================

ALTER TABLE enrollments
  ADD COLUMN IF NOT EXISTS school_id       BIGINT       NULL    COMMENT 'tenant isolation',
  ADD COLUMN IF NOT EXISTS enrollment_date DATE         NULL    COMMENT 'date of enrollment',
  ADD COLUMN IF NOT EXISTS enrollment_type VARCHAR(50)  NULL    DEFAULT 'new' COMMENT 'new|transfer|re-enroll',
  ADD COLUMN IF NOT EXISTS joined_at       TIMESTAMP    NULL    COMMENT 'timestamp when student joined class',
  ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMP    NULL    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS deleted_at      TIMESTAMP    NULL    COMMENT 'soft-delete timestamp';

-- Ensure created_at is a proper timestamp (it was INT in some schema versions)
-- Only safe to run if created_at is already INT — skip if already TIMESTAMP
-- ALTER TABLE enrollments MODIFY COLUMN created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP;

-- ============================================================================
-- BLOCK 2: add indexes (safe with IF NOT EXISTS)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_enrollments_school_id   ON enrollments(school_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_deleted_at  ON enrollments(deleted_at);
CREATE INDEX IF NOT EXISTS idx_enrollments_school_term ON enrollments(school_id, term_id, status);
CREATE INDEX IF NOT EXISTS idx_enrollments_student     ON enrollments(student_id, school_id);

-- ============================================================================
-- BLOCK 3: backfill school_id from students table
-- ============================================================================

UPDATE enrollments e
  JOIN students s ON s.id = e.student_id
SET e.school_id = s.school_id
WHERE e.school_id IS NULL
  AND s.school_id IS NOT NULL;

-- ============================================================================
-- BLOCK 4: backfill enrollment_date from students.admission_date
-- ============================================================================

UPDATE enrollments e
  JOIN students s ON s.id = e.student_id
SET e.enrollment_date = s.admission_date
WHERE e.enrollment_date IS NULL
  AND s.admission_date IS NOT NULL;

-- ============================================================================
-- BLOCK 5: notification_templates — insert required system templates
-- Uses INSERT IGNORE so it is idempotent
-- ============================================================================

INSERT IGNORE INTO notification_templates
  (school_id, code, title_template, message_template, default_channel, priority, is_system, is_active)
VALUES
  (NULL, 'student_enrolled',
   'New Student Enrolled',
   'Student {{student_name}} has been successfully enrolled.',
   'in_app', 'normal', 1, 1),

  (NULL, 'student_admitted',
   'New Student Admitted',
   'Student {{student_name}} has been admitted to the school.',
   'in_app', 'normal', 1, 1),

  (NULL, 'student_created',
   'Student Record Created',
   'A new student record has been created for {{student_name}}.',
   'in_app', 'normal', 1, 1);

-- ============================================================================
-- BLOCK 6: verify results (informational — will not fail)
-- ============================================================================

SELECT
  COUNT(*)                         AS total_enrollments,
  SUM(school_id IS NOT NULL)       AS with_school_id,
  SUM(deleted_at IS NULL)          AS not_deleted,
  SUM(enrollment_date IS NOT NULL) AS with_enrollment_date
FROM enrollments;
