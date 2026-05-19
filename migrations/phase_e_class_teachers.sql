-- ============================================================================
-- Phase E — Class teacher relationship
--
-- Replace the free-text classTeacher field that lived inside snapshot
-- payloads with a real schema entity. Class teachers are now a per-
-- (class, term, stream) assignment, time-bounded so reassignments
-- preserve history.
--
-- Snapshot generator looks up the class teacher for the snapshot's term
-- and writes the staff name into the existing snapshot.classes[].
-- classTeacher field — the render layer stays unchanged.
--
-- Rollback:
--   DROP TABLE class_teachers;
-- ============================================================================

CREATE TABLE IF NOT EXISTS class_teachers (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  school_id       BIGINT       NOT NULL,
  class_id        BIGINT       NOT NULL,
  /** NULL = class-wide assignment (covers every stream within the class). */
  stream_id       BIGINT       NULL,
  term_id         INT          NOT NULL,
  staff_id        BIGINT       NOT NULL,
  assigned_by     INT          NOT NULL,
  assigned_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  /** When the assignment ceases to apply. NULL = currently active. */
  valid_until     DATETIME     NULL,
  notes           VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_class_term (class_id, term_id, stream_id),
  KEY idx_school_class (school_id, class_id),
  KEY idx_staff (staff_id),
  CONSTRAINT fk_class_teacher_class
    FOREIGN KEY (class_id)  REFERENCES classes(id)  ON DELETE CASCADE,
  CONSTRAINT fk_class_teacher_term
    FOREIGN KEY (term_id)   REFERENCES terms(id),
  CONSTRAINT fk_class_teacher_stream
    FOREIGN KEY (stream_id) REFERENCES streams(id),
  CONSTRAINT fk_class_teacher_staff
    FOREIGN KEY (staff_id)  REFERENCES staff(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
