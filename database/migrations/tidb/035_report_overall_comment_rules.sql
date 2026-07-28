-- Intelligent overall-comment engine (Report Engine Patch Program, Phase II).
-- Replaces the static, identical-for-every-learner Class Teacher / DOS /
-- Headteacher comments with school-configurable, performance-driven rules.
-- Condition trees (AND/OR/nested, same semantics as DRCE section visibility)
-- are stored as JSON and evaluated by src/lib/drce/commentEngine.ts at
-- snapshot generation time — resolved comments are frozen into the snapshot,
-- never recomputed at render (RENDER_LAYERS.md immutability invariant).

CREATE TABLE IF NOT EXISTS report_overall_comment_rules (
  id                BIGINT        NOT NULL AUTO_INCREMENT,
  school_id         BIGINT        NOT NULL,
  role              VARCHAR(24)   NOT NULL,               -- classTeacher|dos|headTeacher|custom
  custom_key        VARCHAR(64)   NULL,                    -- required when role='custom'
  mode              VARCHAR(8)    NOT NULL DEFAULT 'replace', -- replace|append
  condition_json    JSON          NULL,                    -- VisibilityRule tree; NULL = always matches
  comment_text      TEXT          NOT NULL,
  comment_text_ar   TEXT          NULL,
  priority          INT           NOT NULL DEFAULT 100,    -- lower = evaluated first
  is_active         TINYINT       NOT NULL DEFAULT 1,
  created_by        BIGINT        NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school_role_active (school_id, role, is_active)
);
