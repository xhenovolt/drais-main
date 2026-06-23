-- Per-learner fee adjustments (fee-rules Batch C).
-- Waiver / %-discount / fixed-discount / amount override applied by the bill
-- engine on top of rule-generated lines. `tag` records scholarship/staff-child/
-- sibling for reporting; only status='approved' adjustments affect a bill.

CREATE TABLE IF NOT EXISTS learner_fee_adjustments (
  id               BIGINT        NOT NULL AUTO_INCREMENT,
  school_id        BIGINT        NOT NULL,
  student_id       BIGINT        NOT NULL,
  fee_item_id      BIGINT        NULL,    -- NULL = applies to all the learner's lines
  term_id          BIGINT        NULL,    -- NULL = any term
  academic_year_id BIGINT        NULL,
  adjustment_type  VARCHAR(20)   NOT NULL,            -- waiver | percent_discount | fixed_discount | override
  value            DECIMAL(14,2) NOT NULL DEFAULT 0,  -- percent for %, amount for fixed/override
  tag              VARCHAR(20)   NULL,                 -- scholarship | staff_child | sibling | other
  reason           TEXT          NULL,
  status           VARCHAR(12)   NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  effective_from   DATE          NULL,
  effective_to     DATE          NULL,
  approved_by      BIGINT        NULL,
  approved_at      TIMESTAMP     NULL,
  created_by       BIGINT        NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school_student (school_id, student_id),
  KEY idx_status (school_id, status)
);
