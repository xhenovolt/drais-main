import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { sendAfricasTalkingSMS, normalizePhoneNumber, type SMSResponse } from '@/lib/africastalking';

export type SmsProviderType = 'africas_talking' | 'yoola' | 'ugatext';

export const UGATEXT_API_BASE_URL = 'https://ugatext.com/api/v1';
export const UGATEXT_DEFAULT_SENDER_ID = 'UGATEXT';

export interface SmsProviderConfig {
  apiKey?: string | null;
  username?: string | null;
  password?: string | null;
  senderId?: string | null;
  baseUrl?: string | null;
  [key: string]: string | null | undefined;
}

export interface SmsBalance {
  supported: boolean;
  ok: boolean;
  amount: number | null;
  currency: string | null;
  units: number | null;
  error?: string;
}

export interface SmsProviderAdapter {
  type: SmsProviderType;
  displayName: string;
  requiredFields: string[];
  send(phone: string, message: string, config: SmsProviderConfig): Promise<SMSResponse>;
  getBalance(config: SmsProviderConfig): Promise<SmsBalance>;
  validate(config: SmsProviderConfig): Promise<{ ok: boolean; status: string; message?: string; balance?: SmsBalance }>;
}

function requireValue(config: SmsProviderConfig, field: string): string | null {
  const value = config[field];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseBalance(raw: unknown): { currency: string | null; amount: number | null } {
  const match = String(raw ?? '').trim().match(/^([A-Za-z]{3})?\s*([\d,]+(?:\.\d+)?)/);
  return match ? { currency: (match[1] || '').toUpperCase() || null, amount: Number(match[2].replace(/,/g, '')) } : { currency: null, amount: null };
}

const africasTalking: SmsProviderAdapter = {
  type: 'africas_talking',
  displayName: "Africa's Talking",
  requiredFields: ['username', 'apiKey'],
  async send(phone, message, config) {
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return { success: false, error: 'Invalid phone number format' };
    return sendAfricasTalkingSMS(normalized, message, undefined, requireValue(config, 'senderId') || undefined, {
      username: requireValue(config, 'username'),
      apiKey: requireValue(config, 'apiKey'),
    });
  },
  async getBalance(config) {
    const username = requireValue(config, 'username');
    const apiKey = requireValue(config, 'apiKey');
    if (!username || !apiKey) return { supported: true, ok: false, amount: null, currency: null, units: null, error: 'Username and API key are required' };
    try {
      const host = username === 'sandbox' ? 'https://api.sandbox.africastalking.com' : 'https://api.africastalking.com';
      const response = await fetch(`${host}/version1/user?username=${encodeURIComponent(username)}`, { headers: { apiKey, Accept: 'application/json' } });
      if (!response.ok) return { supported: true, ok: false, amount: null, currency: null, units: null, error: `Provider HTTP ${response.status}` };
      const body = await response.json();
      const parsed = parseBalance(body?.UserData?.balance);
      if (parsed.amount == null) return { supported: true, ok: false, amount: null, currency: parsed.currency, units: null, error: 'Provider returned an unreadable balance' };
      return { supported: true, ok: true, amount: parsed.amount, currency: parsed.currency, units: null };
    } catch (error: any) {
      return { supported: true, ok: false, amount: null, currency: null, units: null, error: error?.message || 'Balance request failed' };
    }
  },
  async validate(config) {
    const missing = ['username', 'apiKey'].filter((field) => !requireValue(config, field));
    if (missing.length) return { ok: false, status: 'configuration_incomplete', message: `Missing: ${missing.join(', ')}` };
    const balance = await this.getBalance(config);
    return balance.ok ? { ok: true, status: 'connected', balance } : { ok: false, status: 'authentication_failed', message: balance.error, balance };
  },
};

const yoola: SmsProviderAdapter = {
  type: 'yoola',
  displayName: 'Yoola SMS',
  requiredFields: ['apiKey'],
  async send(phone, message, config) {
    const apiKey = requireValue(config, 'apiKey');
    if (!apiKey) return { success: false, error: 'Yoola API key is required' };
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return { success: false, error: 'Invalid phone number format' };
    try {
      const response = await fetch(`${requireValue(config, 'baseUrl') || 'https://yoolasms.com/api/v1/send'}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey, phone: normalized.replace(/^\+/, ''), message }),
      });
      const body = await response.json().catch(() => ({}));
      const recipient = body?.per_recipient?.[0];
      if (!response.ok || body?.status !== 'success' || recipient?.status !== 'Success') {
        return { success: false, status: body?.status || `HTTP ${response.status}`, error: body?.message || `Provider HTTP ${response.status}`, details: body };
      }
      return { success: true, status: recipient.status, messageId: String(body.message_id ?? recipient.reference ?? ''), cost: recipient.cost || body.amount_charged, phone: normalized, details: body };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Yoola request failed' };
    }
  },
  async getBalance() {
    return { supported: false, ok: false, amount: null, currency: null, units: null, error: 'Yoola balance endpoint is not configured; send responses expose balance only after sending' };
  },
  async validate(config) {
    const apiKey = requireValue(config, 'apiKey');
    if (!apiKey) return { ok: false, status: 'configuration_incomplete', message: 'Missing: apiKey' };
    return { ok: true, status: 'configured', message: 'Credentials are present; use a controlled test SMS to verify provider acceptance' };
  },
};

const ugaText: SmsProviderAdapter = {
  type: 'ugatext',
  displayName: 'UgaText',
  requiredFields: ['apiKey'],
  async send(phone, message, config) {
    const apiKey = requireValue(config, 'apiKey');
    if (!apiKey) return { success: false, error: 'UgaText API key is required' };
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return { success: false, error: 'Invalid phone number format' };
    try {
      const baseUrl = (requireValue(config, 'baseUrl') || UGATEXT_API_BASE_URL).replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': randomUUID(),
        },
        body: JSON.stringify({
          to: normalized.replace(/^\+/, ''),
          senderId: requireValue(config, 'senderId') || UGATEXT_DEFAULT_SENDER_ID,
          message,
        }),
      });
      const body = await response.json().catch(() => ({}));
      const status = String(body?.status || '').toLowerCase();
      const accepted = response.status === 202 && ['queued', 'accepted', 'success'].includes(status);
      const providerError = body?.message || body?.error?.message || body?.error || `Provider HTTP ${response.status}`;
      if (!accepted) return { success: false, status: body?.status || `HTTP ${response.status}`, error: String(providerError), details: body };
      const messageId = body?.message_id ?? body?.messageId ?? body?.id ?? body?.data?.message_id ?? body?.data?.id ?? null;
      return { success: true, status: body?.status || 'Accepted', messageId: messageId == null ? undefined : String(messageId), phone: normalized, details: body };
    } catch (error: any) {
      return { success: false, error: error?.message || 'UgaText request failed' };
    }
  },
  async getBalance(config) {
    const clientId = requireValue(config, 'clientId');
    const clientSecret = requireValue(config, 'clientSecret');
    if (!clientId || !clientSecret) return { supported: true, ok: false, amount: null, currency: null, units: null, error: 'UgaText balance requires clientId and clientSecret' };
    try {
      const baseUrl = (requireValue(config, 'baseUrl') || UGATEXT_API_BASE_URL).replace(/\/$/, '');
      const response = await fetch(`${baseUrl}/sms/balance`, { headers: { 'Client-ID': clientId, 'Client-Secret': clientSecret, Accept: 'application/json' } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) return { supported: true, ok: false, amount: null, currency: null, units: null, error: String(body?.message || body?.error?.message || body?.error || `Provider HTTP ${response.status}`) };
      return { supported: true, ok: true, amount: Number(body?.balance_ugx ?? body?.balance ?? 0), currency: body?.currency || 'UGX', units: body?.estimated_sms_units == null ? null : Number(body.estimated_sms_units) };
    } catch (error: any) {
      return { supported: true, ok: false, amount: null, currency: null, units: null, error: error?.message || 'Balance request failed' };
    }
  },
  async validate(config) {
    const apiKey = requireValue(config, 'apiKey');
    if (!apiKey) return { ok: false, status: 'configuration_incomplete', message: 'Missing: apiKey' };
    const balance = await this.getBalance(config);
    return balance.ok ? { ok: true, status: 'connected', balance } : { ok: true, status: 'configured', message: balance.error || 'Credentials are present; use a controlled test SMS to verify provider acceptance', balance };
  },
};

export const SMS_PROVIDER_ADAPTERS: Record<SmsProviderType, SmsProviderAdapter> = {
  africas_talking: africasTalking,
  yoola,
  ugatext: ugaText,
};

const encryptionKey = () => {
  const configured = process.env.SMS_PROVIDER_ENCRYPTION_KEY || process.env.DEVICE_ENCRYPTION_KEY || process.env.ENCRYPTION_KEY;
  if (!configured && process.env.NODE_ENV === 'production') throw new Error('SMS_PROVIDER_ENCRYPTION_KEY is required in production');
  return createHash('sha256').update(configured || 'drais-development-provider-key').digest();
};

export function encryptProviderConfig(config: SmsProviderConfig): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final()]);
  return `${iv.toString('hex')}.${cipher.getAuthTag().toString('hex')}.${encrypted.toString('base64')}`;
}

export function decryptProviderConfig(value: string): SmsProviderConfig {
  const [ivHex, tagHex, body] = value.split('.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8')) as SmsProviderConfig;
}

export function fingerprintProviderConfig(config: SmsProviderConfig): string {
  return createHash('sha256').update(JSON.stringify(Object.keys(config).sort().reduce((out, key) => ({ ...out, [key]: config[key] ? 'set' : null }), {} as Record<string, string | null>))).digest('hex');
}

export async function sendWithAdapter(type: SmsProviderType, phone: string, message: string, config: SmsProviderConfig): Promise<SMSResponse> {
  return SMS_PROVIDER_ADAPTERS[type].send(phone, message, config);
}
