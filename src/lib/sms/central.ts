import { query } from '@/lib/db';
import { sendAfricasTalkingSMS, type SMSResponse, type SmsCredentials } from '@/lib/africastalking';
import { decryptProviderConfig, sendWithAdapter, type SmsProviderConfig, type SmsProviderType } from './providers';

export interface ActiveSmsProvider {
  id: number;
  providerType: SmsProviderType;
  displayName: string;
  config: SmsProviderConfig;
  senderId: string | null;
}

let schemaReady: Promise<void> | null = null;
export function ensureCentralSmsSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await query(`CREATE TABLE IF NOT EXISTS sms_provider_configs (
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
      UNIQUE KEY uk_sms_provider_type (provider_type), KEY idx_sms_provider_active (is_active, enabled)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []).catch(() => {});
    await query(`CREATE TABLE IF NOT EXISTS sms_provider_operations (
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
      KEY idx_sms_provider_ops_provider (provider_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []).catch(() => {});
  })();
  return schemaReady;
}

export async function getActiveSmsProvider(): Promise<ActiveSmsProvider | null> {
  await ensureCentralSmsSchema();
  const rows = await query(`SELECT id, provider_type, display_name, encrypted_config FROM sms_provider_configs WHERE is_active = 1 AND enabled = 1 LIMIT 1`).catch(() => []) as any[];
  const row = rows[0];
  if (!row) return null;
  try {
    const config = decryptProviderConfig(String(row.encrypted_config));
    return { id: Number(row.id), providerType: row.provider_type as SmsProviderType, displayName: String(row.display_name), config, senderId: config.senderId || null };
  } catch {
    // Preserve the active-provider decision even when its secret cannot be
    // decrypted; falling back to a different account would hide an outage.
    return { id: Number(row.id), providerType: row.provider_type as SmsProviderType, displayName: String(row.display_name), config: {}, senderId: null };
  }
}

export async function sendCentralSMS(phone: string, message: string, recipientName?: string, senderId?: string, legacyCreds?: SmsCredentials): Promise<SMSResponse> {
  const active = await getActiveSmsProvider();
  if (!active) {
    return sendAfricasTalkingSMS(phone, message, recipientName, senderId, legacyCreds);
  }
  const result = await sendWithAdapter(active.providerType, phone, message, { ...active.config, senderId: active.senderId || active.config.senderId });
  await query(`UPDATE sms_provider_configs SET last_success_at = CASE WHEN ? = 1 THEN NOW() ELSE last_success_at END, last_failure_at = CASE WHEN ? = 1 THEN last_failure_at ELSE NOW() END, last_provider_message_id = ? WHERE id = ?`, [result.success ? 1 : 0, result.success ? 1 : 0, result.messageId || null, active.id]).catch(() => {});
  await query(`INSERT INTO sms_provider_operations (provider_id, provider_type, operation, success, provider_message_id, recipient_phone, error_message, metadata_json) VALUES (?, ?, 'send', ?, ?, ?, ?, ?)`, [active.id, active.providerType, result.success ? 1 : 0, result.messageId || null, phone, result.error || null, result.details ? JSON.stringify({ status: result.status || null, cost: result.cost || null }) : null]).catch(() => {});
  return result;
}
