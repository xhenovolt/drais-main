import { query } from '@/lib/db';
import { ensureCentralSmsSchema } from '@/lib/sms/central';
import { decryptProviderConfig, encryptProviderConfig, fingerprintProviderConfig, SMS_PROVIDER_ADAPTERS, type SmsProviderConfig, type SmsProviderType } from '@/lib/sms/providers';

export interface SmsProviderInput {
  providerType: SmsProviderType;
  displayName?: string;
  config: SmsProviderConfig;
}

function safeConfig(config: SmsProviderConfig) {
  return Object.fromEntries(Object.entries(config).filter(([key, value]) => key !== 'password' && key !== 'apiKey' && key !== 'username' && key !== 'senderId' && key !== 'baseUrl' ? value != null : value ? true : false).map(([key, value]) => {
    if (typeof value !== 'string') return [key, value];
    return [key, value.length > 4 ? `${'*'.repeat(Math.min(8, value.length - 4))}${value.slice(-4)}` : '****'];
  }));
}

function rowView(row: any, config: SmsProviderConfig) {
  return {
    id: Number(row.id), provider_type: row.provider_type, display_name: row.display_name,
    enabled: Number(row.enabled) === 1, active: Number(row.is_active) === 1,
    status: row.status, status_message: row.status_message || null,
    config: safeConfig(config), configured_fields: Object.keys(config).filter((key) => !!config[key]),
    balance: row.balance_amount == null ? null : { amount: Number(row.balance_amount), currency: row.balance_currency || null, units: row.balance_units == null ? null : Number(row.balance_units), checked_at: row.balance_checked_at || null },
    last_success_at: row.last_success_at || null, last_failure_at: row.last_failure_at || null,
    last_provider_message_id: row.last_provider_message_id || null,
    created_at: row.created_at, updated_at: row.updated_at,
  };
}

async function loadRow(id: number): Promise<{ row: any; config: SmsProviderConfig } | null> {
  await ensureCentralSmsSchema();
  const rows = await query(`SELECT * FROM sms_provider_configs WHERE id = ? LIMIT 1`, [id]).catch(() => []) as any[];
  if (!rows[0]) return null;
  return { row: rows[0], config: decryptProviderConfig(String(rows[0].encrypted_config)) };
}

export async function listSmsProviders() {
  await ensureCentralSmsSchema();
  const rows = await query(`SELECT * FROM sms_provider_configs ORDER BY display_name ASC`).catch(() => []) as any[];
  return rows.map((row) => {
    try { return rowView(row, decryptProviderConfig(String(row.encrypted_config))); }
    catch { return rowView(row, {}); }
  });
}

export async function createSmsProvider(input: SmsProviderInput, userId: number | null) {
  const adapter = SMS_PROVIDER_ADAPTERS[input.providerType];
  if (!adapter) return { ok: false, error: 'Unsupported SMS provider' } as const;
  const validation = await adapter.validate(input.config);
  if (!validation.ok) return { ok: false, error: validation.message || 'Provider configuration failed validation', validation } as const;
  await ensureCentralSmsSchema();
  const displayName = input.displayName?.trim() || adapter.displayName;
  try {
    const result = await query(`INSERT INTO sms_provider_configs (provider_type, display_name, encrypted_config, config_fingerprint, status, status_message, balance_amount, balance_currency, balance_units, balance_checked_at, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN NOW() ELSE NULL END, ?, ?)`, [input.providerType, displayName, encryptProviderConfig(input.config), fingerprintProviderConfig(input.config), validation.status, validation.message || null, validation.balance?.amount ?? null, validation.balance?.currency ?? null, validation.balance?.units ?? null, validation.balance?.ok ? 1 : 0, userId, userId]) as any;
    return { ok: true, id: Number(result.insertId), validation } as const;
  } catch (error: any) {
    return { ok: false, error: /Duplicate|uk_sms_provider_type/i.test(error?.message || '') ? 'This provider type is already configured' : 'Failed to save provider configuration' } as const;
  }
}

export async function updateSmsProvider(id: number, patch: Partial<SmsProviderInput>, userId: number | null) {
  const current = await loadRow(id);
  if (!current) return { ok: false, error: 'Provider not found' } as const;
  const providerType = patch.providerType || current.row.provider_type as SmsProviderType;
  const config = { ...current.config, ...(patch.config || {}) };
  const adapter = SMS_PROVIDER_ADAPTERS[providerType];
  if (!adapter) return { ok: false, error: 'Unsupported SMS provider' } as const;
  const validation = await adapter.validate(config);
  if (!validation.ok) return { ok: false, error: validation.message || 'Provider configuration failed validation', validation } as const;
  await query(`UPDATE sms_provider_configs SET provider_type = ?, display_name = ?, encrypted_config = ?, config_fingerprint = ?, status = ?, status_message = ?, balance_amount = ?, balance_currency = ?, balance_units = ?, balance_checked_at = CASE WHEN ? = 1 THEN NOW() ELSE balance_checked_at END, updated_by = ? WHERE id = ?`, [providerType, patch.displayName?.trim() || current.row.display_name, encryptProviderConfig(config), fingerprintProviderConfig(config), validation.status, validation.message || null, validation.balance?.amount ?? null, validation.balance?.currency ?? null, validation.balance?.units ?? null, validation.balance?.ok ? 1 : 0, userId, id]);
  return { ok: true, validation } as const;
}

export async function activateSmsProvider(id: number, userId: number | null) {
  const current = await loadRow(id);
  if (!current) return { ok: false, error: 'Provider not found' } as const;
  if (Number(current.row.enabled) !== 1) return { ok: false, error: 'Disabled providers cannot become active' } as const;
  const adapter = SMS_PROVIDER_ADAPTERS[current.row.provider_type as SmsProviderType];
  if (!current.row.last_success_at) return { ok: false, error: 'Send a successful controlled test before activating this provider' } as const;
  const validation = await adapter.validate(current.config);
  if (!validation.ok) return { ok: false, error: validation.message || 'Provider validation failed', validation } as const;
  await ensureCentralSmsSchema();
  await query(`UPDATE sms_provider_configs SET is_active = 0, updated_by = ? WHERE is_active = 1`, [userId]);
  await query(`UPDATE sms_provider_configs SET is_active = 1, status = ?, status_message = ?, updated_by = ? WHERE id = ?`, [validation.status, validation.message || null, userId, id]);
  return { ok: true, validation } as const;
}

export async function setSmsProviderEnabled(id: number, enabled: boolean, userId: number | null) {
  const current = await loadRow(id);
  if (!current) return { ok: false, error: 'Provider not found' } as const;
  if (!enabled && Number(current.row.is_active) === 1) return { ok: false, error: 'Deactivate the provider before disabling it' } as const;
  await query(`UPDATE sms_provider_configs SET enabled = ?, status = CASE WHEN ? = 1 THEN status ELSE 'disabled' END, updated_by = ? WHERE id = ?`, [enabled ? 1 : 0, enabled ? 1 : 0, userId, id]);
  return { ok: true } as const;
}

export async function deleteSmsProvider(id: number) {
  const current = await loadRow(id);
  if (!current) return { ok: false, error: 'Provider not found' } as const;
  if (Number(current.row.is_active) === 1) return { ok: false, error: 'The active provider cannot be deleted' } as const;
  await query(`DELETE FROM sms_provider_configs WHERE id = ?`, [id]);
  return { ok: true } as const;
}

export async function getSmsProviderForTest(id: number) {
  const current = await loadRow(id);
  if (!current) return null;
  return { id, providerType: current.row.provider_type as SmsProviderType, config: current.config };
}

export async function refreshSmsProviderBalance(id: number) {
  const current = await loadRow(id);
  if (!current) return { ok: false, error: 'Provider not found' } as const;
  const adapter = SMS_PROVIDER_ADAPTERS[current.row.provider_type as SmsProviderType];
  const balance = await adapter.getBalance(current.config);
  await query(`UPDATE sms_provider_configs SET balance_amount = ?, balance_currency = ?, balance_units = ?, balance_checked_at = NOW(), status = CASE WHEN ? = 1 THEN status ELSE 'balance_unavailable' END, status_message = ? WHERE id = ?`, [balance.amount, balance.currency, balance.units, balance.ok ? 1 : 0, balance.ok ? null : balance.error || 'Balance unavailable', id]).catch(() => {});
  return { ok: balance.ok, balance, error: balance.error || null } as const;
}
