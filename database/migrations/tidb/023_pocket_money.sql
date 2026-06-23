-- Learner pocket money (Track B, Batch 6).
-- A custodial wallet per learner: parents deposit, learners withdraw, the school
-- holds the money. Balance is DERIVED = SUM(deposits) - SUM(withdrawals).

CREATE TABLE IF NOT EXISTS pocket_money_accounts (
  id                    BIGINT        NOT NULL AUTO_INCREMENT,
  school_id             BIGINT        NOT NULL,
  student_id            BIGINT        NOT NULL,
  custodian             VARCHAR(150)  NULL,
  low_balance_threshold DECIMAL(14,2) NOT NULL DEFAULT 0,
  status                VARCHAR(20)   NOT NULL DEFAULT 'active',
  created_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_school_student (school_id, student_id)
);

CREATE TABLE IF NOT EXISTS pocket_money_transactions (
  id             BIGINT        NOT NULL AUTO_INCREMENT,
  school_id      BIGINT        NOT NULL,
  student_id     BIGINT        NOT NULL,
  account_id     BIGINT        NOT NULL,
  type           VARCHAR(12)   NOT NULL,            -- deposit | withdrawal
  amount         DECIMAL(14,2) NOT NULL,
  custodian      VARCHAR(150)  NULL,
  reason         VARCHAR(255)  NULL,
  depositor_name VARCHAR(150)  NULL,                -- parent/guardian who deposited
  approved_by    BIGINT        NULL,
  received_by    BIGINT        NULL,
  slip_no        VARCHAR(60)   NULL,
  notes          TEXT          NULL,
  created_by     BIGINT        NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school_student (school_id, student_id),
  KEY idx_account (account_id)
);
