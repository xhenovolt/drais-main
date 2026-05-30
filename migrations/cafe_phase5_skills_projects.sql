-- ============================================================================
-- CAFE Phase 5 — student-level generic skills + project portfolio storage.
--
-- Two parallel student-level tables (keyed by student × term, not student
-- × subject × term like component results) that schools fill from the
-- entry UI. Snapshot adapter populates student.genericSkills /
-- student.projects so the Phase 4 SkillsBlock + ProjectOutcomes sections
-- stop rendering their placeholder text and show real data.
--
-- Promotion rules reuse the existing `school_academic_settings.promotion_rule_json`
-- column from Phase 1 — no new storage required; the evaluator runs
-- src/lib/drce/visibility.ts against each student's data context.
--
-- Rollback:
--   DROP TABLE student_projects;
--   DROP TABLE student_generic_skills;
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_generic_skills (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  school_id         INT          NOT NULL,
  student_id        BIGINT       NOT NULL,
  term_id           INT          NOT NULL,
  skill_code        VARCHAR(64)  NOT NULL,
  skill_label       VARCHAR(160) NOT NULL,
  scoring_model_id  BIGINT       NULL,
  score             DECIMAL(10,4) NULL,
  value_text        TEXT         NULL,
  grade_code        VARCHAR(32)  NULL,
  remarks           VARCHAR(500) NULL,
  entered_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  entered_by        BIGINT       NULL,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_gskill (student_id, term_id, skill_code),
  KEY idx_gskill_school_term (school_id, term_id),
  KEY idx_gskill_skill (skill_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS student_projects (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  school_id         INT          NOT NULL,
  student_id        BIGINT       NOT NULL,
  term_id           INT          NOT NULL,
  title             VARCHAR(200) NOT NULL,
  descriptor        TEXT         NULL,
  outcome           TEXT         NULL,
  evidence_url      VARCHAR(500) NULL,
  scoring_model_id  BIGINT       NULL,
  grade_code        VARCHAR(32)  NULL,
  remarks           VARCHAR(500) NULL,
  entered_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  entered_by        BIGINT       NULL,
  updated_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_project_student_term (student_id, term_id),
  KEY idx_project_school_term (school_id, term_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
