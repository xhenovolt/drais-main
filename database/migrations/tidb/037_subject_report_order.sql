-- Configurable subject ordering for reports (Report Engine Patch Program,
-- Reporting Architecture Phase 1). Previously subjects on a report card
-- rendered in raw database-id order (src/lib/snapshots/generator.ts sorted
-- `.subjects.values()` by `a.id - b.id`) — a random accident of insertion
-- order, with no way for a school to say "Mathematics, English, Physics,
-- Chemistry... then electives".
--
-- One table covers all four levels of specificity the school asked for
-- (custom priority, school-wide default, class-specific, exam/result-type-
-- specific) via nullable scoping columns — the same "most specific row wins"
-- pattern already used by report_comment_rules / report_overall_comment_rules
-- rather than a new pattern. class_id/result_type_id NULL = wildcard (applies
-- to any class / any exam type at that specificity tier).

CREATE TABLE IF NOT EXISTS subject_report_order (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  school_id       BIGINT       NOT NULL,
  subject_id      BIGINT       NOT NULL,
  class_id        BIGINT       NULL,      -- NULL = applies to all classes
  result_type_id  BIGINT       NULL,      -- NULL = applies to all exam/result types
  priority        INT          NOT NULL DEFAULT 100, -- lower = earlier in the report
  created_by      BIGINT       NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_subject_order_scope (school_id, subject_id, class_id, result_type_id),
  KEY idx_subject_order_school (school_id),
  KEY idx_subject_order_class (school_id, class_id),
  KEY idx_subject_order_result_type (school_id, result_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Configurable per-school/class/exam subject display order for reports.';
