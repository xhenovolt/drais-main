-- ============================================================================
-- CAFE Phase 2 — student component result storage.
--
-- One row per (student, class, subject, term, component). Parallel to the
-- legacy class_results table — schools using CAFE write here; schools not
-- using CAFE keep writing to class_results unchanged.
--
-- Phase 2 wires snapshots to READ this table when a framework is assigned
-- to (class, term); Phase 3 ships the entry UI that WRITES to it.
--
-- Per-component value storage uses three columns so any scoring kind can
-- be persisted without polymorphic serialisation: numeric/scale models
-- write `score` (DECIMAL); descriptor models write `value_text`; both
-- can carry a derived `grade_code` looked up from grade_mappings.
--
-- Rollback:
--   DROP TABLE student_component_results;
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_component_results (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  school_id       INT          NOT NULL,
  student_id      BIGINT       NOT NULL,
  class_id        INT          NOT NULL,
  subject_id      INT          NOT NULL,
  term_id         INT          NOT NULL,
  framework_id    BIGINT       NOT NULL,
  component_id    BIGINT       NOT NULL,
  -- Numeric / scale value. NULL for descriptor-only entries.
  score           DECIMAL(10,4) NULL,
  -- Free-text descriptor (or selected descriptor code), used by
  -- 'descriptor' scoring kinds and as a teacher note for any kind.
  value_text      TEXT         NULL,
  -- Grade code from grade_mappings (e.g. 'A', '3', 'Accomplished').
  -- Computed at write time by the resolver; stored for fast reads.
  grade_code      VARCHAR(32)  NULL,
  remarks         VARCHAR(500) NULL,
  entered_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  entered_by      BIGINT       NULL,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_scr_cell (student_id, class_id, subject_id, term_id, component_id),
  KEY idx_scr_lookup (school_id, class_id, term_id, subject_id),
  KEY idx_scr_framework (framework_id, component_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
