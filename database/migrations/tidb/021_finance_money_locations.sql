-- Money locations + transfers (Track B, Batch 4).
-- Extends `wallets` into real money locations (cash at bursar/headteacher, bank,
-- mobile money, School Pay, SurePay, other) and tracks transfers between them.
-- finance_payments.account_id already points at a wallet (the destination).

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS location_type   VARCHAR(30)   NOT NULL DEFAULT 'cash';
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS provider        VARCHAR(60)   NULL;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS account_number  VARCHAR(60)   NULL;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS bank_name       VARCHAR(120)  NULL;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS branch_name     VARCHAR(120)  NULL;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS opening_balance DECIMAL(14,2) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS finance_account_transfers (
  id             BIGINT        NOT NULL AUTO_INCREMENT,
  school_id      BIGINT        NOT NULL,
  from_wallet_id BIGINT        NOT NULL,
  to_wallet_id   BIGINT        NOT NULL,
  amount         DECIMAL(14,2) NOT NULL,
  transfer_type  VARCHAR(40)   NULL,   -- cash_to_bank | mm_to_bank | bursar_to_head | bank_to_expense | other
  reference      VARCHAR(150)  NULL,
  notes          TEXT          NULL,
  created_by     BIGINT        NULL,
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school (school_id),
  KEY idx_from (from_wallet_id),
  KEY idx_to (to_wallet_id)
);
