-- Finance fee-rules engine — new-entrant condition, payment channel, clearance.
-- Additive only; existing fee_items / fee_eligibility_rules rows are unaffected
-- (sensible defaults: channel 'any', clearance 'optional').

-- payment_channel values: any | school_code | bank | mobile_money | cash | bursar_cash
ALTER TABLE fee_items ADD COLUMN IF NOT EXISTS payment_channel VARCHAR(20) NOT NULL DEFAULT 'any';

-- clearance values: optional | before_entry | partial_allowed | bursar_approval
ALTER TABLE fee_items ADD COLUMN IF NOT EXISTS clearance VARCHAR(20) NOT NULL DEFAULT 'optional';

-- new-entrant eligibility (admission fee etc.). NULL = don't care; 1 = new only; 0 = continuing only.
ALTER TABLE fee_eligibility_rules ADD COLUMN IF NOT EXISTS is_new_entrant TINYINT NULL;

-- Bursar/director clearance exceptions per learner+term (Phase 5).
-- status: requested | approved | rejected | blocked
CREATE TABLE IF NOT EXISTS fee_clearance_exceptions (
  id               BIGINT      NOT NULL AUTO_INCREMENT,
  school_id        BIGINT      NOT NULL,
  student_id       BIGINT      NOT NULL,
  term_id          BIGINT      NULL,
  academic_year_id BIGINT      NULL,
  status           VARCHAR(20) NOT NULL DEFAULT 'requested',
  reason           TEXT        NULL,
  requested_by     BIGINT      NULL,
  approved_by      BIGINT      NULL,
  approved_at      TIMESTAMP   NULL,
  created_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school_student (school_id, student_id),
  KEY idx_status (school_id, status)
);
