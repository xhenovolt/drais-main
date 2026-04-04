-- =============================================================================
-- DRAIS FINANCE v2 — LEDGER-BASED STUDENT FEE SYSTEM
-- "Every shilling must have a source, destination, and history."
--
-- Run this migration once. All tables use IF NOT EXISTS — safe to re-run.
-- TiDB Cloud (MySQL-compatible) syntax.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. FINANCE ACCOUNTS — where school money lives
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_accounts (
  id          BIGINT        NOT NULL AUTO_INCREMENT,
  name        VARCHAR(150)  NOT NULL,
  type        ENUM('income','liability','clearing','asset') NOT NULL DEFAULT 'income',
  school_id   BIGINT        NOT NULL,
  description TEXT          NULL,
  is_active   TINYINT(1)    NOT NULL DEFAULT 1,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_fa_school (school_id),
  INDEX idx_fa_active (school_id, is_active)
);

-- -----------------------------------------------------------------------------
-- 2. FINANCE FEE ITEMS — what students owe, per class and/or program
--    class_id NULL  → applies to ALL classes
--    program_id NULL → applies to ALL programs
--    term_id NULL   → applies to ALL terms
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_fee_items (
  id          BIGINT         NOT NULL AUTO_INCREMENT,
  name        VARCHAR(150)   NOT NULL,
  amount      DECIMAL(14,2)  NOT NULL DEFAULT 0.00,
  class_id    BIGINT         NULL,
  program_id  BIGINT         NULL,
  term_id     BIGINT         NULL,
  school_id   BIGINT         NOT NULL,
  account_id  BIGINT         NULL,         -- → finance_accounts.id
  description TEXT           NULL,
  is_active   TINYINT(1)     NOT NULL DEFAULT 1,
  created_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_ffi_school   (school_id),
  INDEX idx_ffi_class    (class_id),
  INDEX idx_ffi_program  (program_id),
  INDEX idx_ffi_term     (term_id),
  INDEX idx_ffi_active   (school_id, is_active)
);

-- -----------------------------------------------------------------------------
-- 3. STUDENT LEDGER — THE TRUTH. Balance is NEVER stored; always calculated.
--    type = 'debit'  → fee charged / opening balance / penalty
--    type = 'credit' → payment made / waiver applied
--    balance(student) = SUM(debit) - SUM(credit)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_ledger (
  id           BIGINT         NOT NULL AUTO_INCREMENT,
  student_id   BIGINT         NOT NULL,
  school_id    BIGINT         NOT NULL,
  type         ENUM('debit','credit') NOT NULL,
  amount       DECIMAL(14,2)  NOT NULL,
  reference    VARCHAR(255)   NOT NULL,   -- "Term 1 Tuition", "Payment #REC-001"
  fee_item_id  BIGINT         NULL,       -- → finance_fee_items.id (if debit from fee)
  payment_id   BIGINT         NULL,       -- → finance_payments.id  (if credit from payment)
  term_id      BIGINT         NULL,       -- academic term context
  created_by   BIGINT         NULL,
  notes        TEXT           NULL,
  created_at   TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_sl_student_school (student_id, school_id),      -- primary query key
  INDEX idx_sl_type           (type),
  INDEX idx_sl_term           (term_id),
  INDEX idx_sl_created        (created_at)
);

-- -----------------------------------------------------------------------------
-- 4. FINANCE PAYMENTS — clean payment records (new, replaces broken fee_payments)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS finance_payments (
  id             BIGINT         NOT NULL AUTO_INCREMENT,
  student_id     BIGINT         NOT NULL,
  school_id      BIGINT         NOT NULL,
  amount         DECIMAL(14,2)  NOT NULL,
  account_id     BIGINT         NULL,      -- → finance_accounts.id
  method         ENUM('cash','bank_transfer','mpesa','airtel','card','cheque','other')
                                NOT NULL DEFAULT 'cash',
  reference      VARCHAR(120)   NULL,      -- external ref / M-Pesa code
  receipt_no     VARCHAR(50)    NULL,
  paid_by        VARCHAR(150)   NULL,      -- guardian/parent name
  payer_contact  VARCHAR(50)    NULL,
  notes          TEXT           NULL,
  created_by     BIGINT         NULL,
  created_at     TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_fp2_student_school (student_id, school_id),
  INDEX idx_fp2_account        (account_id),
  INDEX idx_fp2_created        (created_at),
  INDEX idx_fp2_receipt        (receipt_no)
);

-- -----------------------------------------------------------------------------
-- 5. FEE ASSIGNMENT LOG — prevents double-charging (idempotency guard)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fee_assignment_log (
  id           BIGINT    NOT NULL AUTO_INCREMENT,
  student_id   BIGINT    NOT NULL,
  fee_item_id  BIGINT    NOT NULL,
  term_id      BIGINT    NULL,
  school_id    BIGINT    NOT NULL,
  ledger_id    BIGINT    NOT NULL,   -- → student_ledger.id
  assigned_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_assignment (student_id, fee_item_id, term_id),
  INDEX idx_fal_student (student_id, school_id)
);

-- ============================================================================
-- NOTE ON PROGRAMS:
-- programs and enrollment_programs tables already exist from migration 021.
-- finance_fee_items.program_id → programs.id
-- ============================================================================
