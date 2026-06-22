-- Tahfiz Phase 1 — first-class Tahfiz participation/enrollment.
-- A learner is a Tahfiz participant iff they have a (non-deleted, active)
-- row here — INDEPENDENT of any academic enrollment. This cleanly supports:
--   academic-only (no row) · academic+tahfiz (track=academic_plus_tahfiz)
--   tahfiz-only (track=tahfiz_only) · hybrid schools (some learners have rows).
-- Removing participation = status change / soft-delete here — NEVER a delete of
-- the canonical students row. Idempotent.

CREATE TABLE IF NOT EXISTS tahfiz_enrollments (
  id            BIGINT       PRIMARY KEY AUTO_INCREMENT,
  school_id     BIGINT       NOT NULL,
  student_id    BIGINT       NOT NULL,
  track         ENUM('academic_plus_tahfiz','tahfiz_only') NOT NULL DEFAULT 'academic_plus_tahfiz',
  program       VARCHAR(50)  NOT NULL DEFAULT 'hifz',     -- hifz | nazirah | qiraat | other
  status        ENUM('active','suspended','withdrawn','completed') NOT NULL DEFAULT 'active',
  joined_date   DATE         NULL,
  left_date     DATE         NULL,
  notes         TEXT         NULL,
  created_by    BIGINT       NULL,
  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at    DATETIME     NULL,
  deleted_by    BIGINT       NULL,
  delete_reason VARCHAR(255) NULL,
  UNIQUE KEY uq_tahfiz_enroll (school_id, student_id),
  KEY idx_tahfiz_enroll_status (school_id, status)
);
