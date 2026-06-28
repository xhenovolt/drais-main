-- Report comment rules (Founder-Independence Phase 4).
-- Schools define result-table comments from the UI. A rule matches a result by
-- any combination of set conditions (ANDed); the most specific active rule wins
-- (then lowest priority number). NULL condition = "don't care".

CREATE TABLE IF NOT EXISTS report_comment_rules (
  id                BIGINT        NOT NULL AUTO_INCREMENT,
  school_id         BIGINT        NOT NULL,
  scope             VARCHAR(24)   NOT NULL DEFAULT 'global', -- global|program|class|subject|grade|score|competency|class_teacher
  subject_id        BIGINT        NULL,
  class_id          BIGINT        NULL,
  program_id        BIGINT        NULL,
  grade_code        VARCHAR(12)   NULL,   -- matches result grade/grade code (e.g. A, D, ABS)
  min_score         DECIMAL(6,2)  NULL,
  max_score         DECIMAL(6,2)  NULL,
  competency_level  VARCHAR(40)   NULL,
  comment_text      TEXT          NOT NULL,
  language          VARCHAR(8)    NOT NULL DEFAULT 'en',
  priority          INT           NOT NULL DEFAULT 100,
  is_active         TINYINT       NOT NULL DEFAULT 1,
  created_by        BIGINT        NULL,
  created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school_active (school_id, is_active)
);
