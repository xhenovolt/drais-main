-- Central platform SMS providers.
-- Credentials/configuration are encrypted by the application before storage.
-- One row may be active at a time; application code enforces the transition.
CREATE TABLE IF NOT EXISTS sms_provider_configs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider_type VARCHAR(64) NOT NULL,
  display_name VARCHAR(120) NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  encrypted_config TEXT NOT NULL,
  config_fingerprint CHAR(64) DEFAULT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'configuration_incomplete',
  status_message VARCHAR(500) DEFAULT NULL,
  balance_amount DECIMAL(18,4) DEFAULT NULL,
  balance_currency VARCHAR(8) DEFAULT NULL,
  balance_units INT DEFAULT NULL,
  balance_checked_at DATETIME DEFAULT NULL,
  last_success_at DATETIME DEFAULT NULL,
  last_failure_at DATETIME DEFAULT NULL,
  last_provider_message_id VARCHAR(160) DEFAULT NULL,
  created_by BIGINT DEFAULT NULL,
  updated_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_sms_provider_type (provider_type),
  KEY idx_sms_provider_active (is_active, enabled),
  KEY idx_sms_provider_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sms_provider_operations (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  provider_id BIGINT DEFAULT NULL,
  provider_type VARCHAR(64) NOT NULL,
  operation VARCHAR(40) NOT NULL,
  success TINYINT(1) NOT NULL DEFAULT 0,
  http_status INT DEFAULT NULL,
  provider_message_id VARCHAR(160) DEFAULT NULL,
  recipient_phone VARCHAR(32) DEFAULT NULL,
  error_message VARCHAR(500) DEFAULT NULL,
  metadata_json JSON DEFAULT NULL,
  control_user_id BIGINT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_sms_provider_ops_provider (provider_id, created_at),
  KEY idx_sms_provider_ops_operation (operation, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;