-- 056 - Self-service SMS top-ups (MarzPay mobile money) and per-school SMS pricing.
--
-- sms_school_prices : optional per-school price per SMS (UGX). No row, or a NULL price = the platform default
--                     price (Control Center -> SMS, settings key sms_retail_price_ugx). topup_enabled lets the
--                     operator switch online buying off for a school.
-- sms_topups        : one row per purchase attempt. price_ugx / sms_units / amount_ugx are SNAPSHOTS taken when
--                     the purchase starts, so a later price change never alters what a school already paid for.
--                     Credited exactly once (status paid -> credited happens inside one transaction with the
--                     allowance increase). Only a provider-confirmed, live, exact-amount payment is ever credited.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS sms_topups;
--   DROP TABLE IF EXISTS sms_school_prices;

CREATE TABLE IF NOT EXISTS sms_school_prices (
  school_id     BIGINT NOT NULL PRIMARY KEY,
  price_ugx     DECIMAL(10,2) DEFAULT NULL,
  topup_enabled TINYINT(1) NOT NULL DEFAULT 1,
  note          VARCHAR(255) DEFAULT NULL,
  updated_by    BIGINT DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sms_topups (
  id               BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reference        CHAR(36) NOT NULL,
  school_id        BIGINT NOT NULL,
  user_id          BIGINT DEFAULT NULL,
  amount_ugx       INT NOT NULL,
  price_ugx        DECIMAL(10,2) NOT NULL,
  sms_units        INT NOT NULL,
  phone_masked     VARCHAR(20) DEFAULT NULL,
  status           VARCHAR(16) NOT NULL DEFAULT 'initiated',
  provider         VARCHAR(16) NOT NULL DEFAULT 'marzpay',
  provider_uuid    VARCHAR(64) DEFAULT NULL,
  provider_status  VARCHAR(24) DEFAULT NULL,
  provider_network VARCHAR(16) DEFAULT NULL,
  failure_reason   VARCHAR(255) DEFAULT NULL,
  is_sandbox       TINYINT(1) NOT NULL DEFAULT 0,
  paid_at          DATETIME DEFAULT NULL,
  credited_at      DATETIME DEFAULT NULL,
  created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_topup_reference (reference),
  UNIQUE KEY uk_topup_provider_uuid (provider_uuid),
  KEY idx_topup_school (school_id, created_at),
  KEY idx_topup_status (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
