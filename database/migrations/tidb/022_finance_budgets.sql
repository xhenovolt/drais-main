-- Budgets (Track B, Batch 5). Expenses already exist (expenditures); this adds
-- budgets and links expenses to a budget so spent/remaining is derived.

CREATE TABLE IF NOT EXISTS budgets (
  id                    BIGINT        NOT NULL AUTO_INCREMENT,
  school_id             BIGINT        NOT NULL,
  name                  VARCHAR(150)  NOT NULL,
  budget_type           VARCHAR(20)   NOT NULL DEFAULT 'term',  -- term|department|project|class|activity
  term_id               BIGINT        NULL,
  scope_ref_id          BIGINT        NULL,                      -- dept/class id when applicable
  planned_amount        DECIMAL(14,2) NOT NULL DEFAULT 0,
  approved_amount       DECIMAL(14,2) NOT NULL DEFAULT 0,
  status                VARCHAR(20)   NOT NULL DEFAULT 'draft',  -- draft|approved|closed
  warning_threshold_pct INT           NOT NULL DEFAULT 80,
  notes                 TEXT          NULL,
  created_by            BIGINT        NULL,
  approved_by           BIGINT        NULL,
  approved_at           TIMESTAMP     NULL,
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school_status (school_id, status)
);

ALTER TABLE expenditures ADD COLUMN IF NOT EXISTS budget_id BIGINT NULL;
