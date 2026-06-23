-- Finance import / reconciliation staging (Track B, Batch 3).
-- A two-phase import: rows are staged + matched + deduped in PREVIEW, then
-- committed to the canonical payment/ledger path only after operator confirmation.

CREATE TABLE IF NOT EXISTS finance_import_batches (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  school_id       BIGINT       NOT NULL,
  source_system   VARCHAR(30)  NOT NULL DEFAULT 'manual_excel', -- manual_excel|schoolpay|surepay|bank|mobile_money|custom
  import_type     VARCHAR(30)  NOT NULL DEFAULT 'payments',     -- payments|opening_balances
  filename        VARCHAR(255) NULL,
  status          VARCHAR(20)  NOT NULL DEFAULT 'preview',      -- preview|committed|failed
  term_id         BIGINT       NULL,
  total_rows      INT          NOT NULL DEFAULT 0,
  matched_rows    INT          NOT NULL DEFAULT 0,
  ambiguous_rows  INT          NOT NULL DEFAULT 0,
  unmatched_rows  INT          NOT NULL DEFAULT 0,
  duplicate_rows  INT          NOT NULL DEFAULT 0,
  committed_rows  INT          NOT NULL DEFAULT 0,
  summary_json    JSON         NULL,
  created_by      BIGINT       NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  committed_at    TIMESTAMP    NULL,
  PRIMARY KEY (id),
  KEY idx_school_status (school_id, status)
);

CREATE TABLE IF NOT EXISTS finance_import_rows (
  id                 BIGINT        NOT NULL AUTO_INCREMENT,
  batch_id           BIGINT        NOT NULL,
  school_id          BIGINT        NOT NULL,
  row_no             INT           NOT NULL,
  admission_no       VARCHAR(60)   NULL,
  student_name       VARCHAR(200)  NULL,
  amount             DECIMAL(14,2) NULL,
  reference          VARCHAR(150)  NULL,
  payment_date       DATE          NULL,
  method             VARCHAR(30)   NULL,
  raw_json           JSON          NULL,
  match_status       VARCHAR(20)   NOT NULL DEFAULT 'unmatched', -- matched|ambiguous|unmatched|duplicate
  matched_student_id BIGINT        NULL,
  candidates_json    JSON          NULL,                          -- name-match candidates needing review
  action             VARCHAR(12)   NOT NULL DEFAULT 'pending',    -- import|skip|pending
  error              VARCHAR(255)  NULL,
  committed          TINYINT       NOT NULL DEFAULT 0,
  created_at         TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_batch (batch_id),
  KEY idx_school (school_id)
);
