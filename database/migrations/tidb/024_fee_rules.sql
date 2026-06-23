-- Fee rules engine — model (Batch A).
-- Reusable school-level fee items + eligibility rules. Rules GENERATE per-learner
-- charges (snapshotted into student_fee_items in Batch B); these tables are
-- additive and do not touch the live materialized pipeline.

CREATE TABLE IF NOT EXISTS fee_items (
  id             BIGINT        NOT NULL AUTO_INCREMENT,
  school_id      BIGINT        NOT NULL,
  name           VARCHAR(150)  NOT NULL,
  code           VARCHAR(40)   NULL,
  category       VARCHAR(30)   NOT NULL DEFAULT 'other', -- tuition|uniform|transport|feeding|boarding|examination|activity|tour|medical|library|development|pta|other
  default_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  currency       VARCHAR(8)    NOT NULL DEFAULT 'UGX',
  frequency      VARCHAR(20)   NOT NULL DEFAULT 'termly',  -- once|termly|annually|monthly|custom
  mandatory      TINYINT       NOT NULL DEFAULT 1,
  optional       TINYINT       NOT NULL DEFAULT 0,
  is_active      TINYINT       NOT NULL DEFAULT 1,
  effective_from DATE          NULL,
  effective_to   DATE          NULL,
  notes          TEXT          NULL,
  created_by     BIGINT        NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school_active (school_id, is_active)
);

-- One fee item can have many rules (ORed). Within a rule, all set conditions are
-- ANDed (e.g. girls AND classes [P1,P2,P3]). NULL condition = "don't care".
CREATE TABLE IF NOT EXISTS fee_eligibility_rules (
  id               BIGINT        NOT NULL AUTO_INCREMENT,
  school_id        BIGINT        NOT NULL,
  fee_item_id      BIGINT        NOT NULL,
  name             VARCHAR(150)  NULL,
  applies_to       VARCHAR(20)   NOT NULL DEFAULT 'all', -- all|segment (segment = the conditions below)
  class_ids        JSON          NULL,   -- explicit class set
  level_min        INT           NULL,   -- numeric class_level range (when populated)
  level_max        INT           NULL,
  gender           VARCHAR(15)   NULL,   -- male|female
  boarding         VARCHAR(12)   NULL,   -- boarding|day
  stream_id        BIGINT        NULL,
  program_id       BIGINT        NULL,
  is_candidate     TINYINT       NULL,   -- candidate classes only
  term_id          BIGINT        NULL,
  academic_year_id BIGINT        NULL,
  amount           DECIMAL(14,2) NULL,   -- segment amount; NULL = fee_items.default_amount
  priority         INT           NOT NULL DEFAULT 100,
  is_active        TINYINT       NOT NULL DEFAULT 1,
  notes            TEXT          NULL,
  created_by       BIGINT        NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school_item (school_id, fee_item_id),
  KEY idx_active (school_id, is_active)
);
