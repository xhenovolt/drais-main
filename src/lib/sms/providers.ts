import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { sendAfricasTalkingSMS, normalizePhoneNumber, type SMSResponse } from '@/lib/africastalking';

export type SmsProviderType = 'africas_talking' | 'yoola' | 'ugatext';

// UgaText's dedicated api.ugatext.com host does not resolve in some deployment
// networks (NXDOMAIN, confirmed 2026-10-11). The web gateway serves the same /v1
// API (spec: https://www.ugatext.com/api/v1/openapi.json) and is the path proven
// to deliver (POST /messages, Bearer key, 2026-10-11), so it is the default; the
// bare-domain gateway is tried only when a host is unreachable.
export const UGATEXT_API_BASE_URL = 'https://www.ugatext.com/api/v1';
export const UGATEXT_FALLBACK_BASE_URLS = ['https://www.ugatext.com/api/v1', 'https://ugatext.com/api/v1'];
// Only used when neither the school nor the Control Center provider config sets a sender ID.
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

/** Normalise a configured UgaText base URL to the `/v1` API root. Accepts what the
 *  UgaText dashboard shows ("https://www.ugatext.com/api", "https://api.ugatext.com")
 *  as well as full ".../v1" URLs. */
export function normalizeUgaTextBaseUrl(raw: string): string {
  const url = raw.trim().replace(/\/+$/, '');
  return /\/v1$/.test(url) ? url : `${url}/v1`;
}

function ugaTextBaseUrls(config: SmsProviderConfig): string[] {
  const configured = requireValue(config, 'baseUrl');
  return [...new Set([...(configured ? [normalizeUgaTextBaseUrl(configured)] : []), ...UGATEXT_FALLBACK_BASE_URLS])];
}

/** UgaText accepts `Authorization: Bearer <API_KEY>` (the delivery-proven path) or the
 *  Client-ID + Client-Secret header pair. Prefer the API key; use the client pair when
 *  only that is configured. Values are trimmed and stripped of wrapping quotes — UgaText's
 *  own troubleshooter lists hidden spaces/quotes as a top cause of 401s. */
function ugaTextAuthHeaders(config: SmsProviderConfig): Record<string, string> | null {
  const clean = (field: string) => requireValue(config, field)?.replace(/^["']|["']$/g, '').trim() || null;
  const apiKey = clean('apiKey');
  const clientId = clean('clientId');
  const clientSecret = clean('clientSecret');
  if (apiKey) return { Authorization: `Bearer ${apiKey}` };
  if (clientId && clientSecret) return { 'Client-ID': clientId, 'Client-Secret': clientSecret };
  return null;
}

/** fetch against each candidate base URL, moving on ONLY when a host is unreachable
 *  (DNS/connection error). Any HTTP response — including 4xx — is final, so a send is
 *  never duplicated across hosts. */
async function ugaTextFetch(config: SmsProviderConfig, path: string, init: RequestInit): Promise<Response> {
  let lastError: unknown = null;
  for (const base of ugaTextBaseUrls(config)) {
    try { return await fetch(`${base}${path}`, init); }
    catch (error) { lastError = error; }
  }
  throw lastError ?? new Error('UgaText gateway unreachable');
}

function ugaTextErrorText(body: any): string {
  return [body?.code, body?.error?.code, body?.message, typeof body?.error === 'string' ? body.error : body?.error?.message].filter(Boolean).join(' ');
}

function ugaTextError(body: any, httpStatus: number): string {
  const message = body?.error?.message || body?.message || (typeof body?.error === 'string' ? body.error : null) || `Provider HTTP ${httpStatus}`;
  const code = body?.code || body?.error?.code;
  const hint = httpStatus === 401 || httpStatus === 403 ? ' — update the UgaText API key in Control Center → SMS → Providers' : '';
  return `${message}${code ? ` [${code}]` : ''}${hint}`;
}

const UGATEXT_ACCEPTED = ['queued', 'accepted', 'success', 'sent', 'delivered', 'scheduled'];

const ugaText: SmsProviderAdapter = {
  type: 'ugatext',
  displayName: 'UgaText',
  // apiKey, or clientId + clientSecret — validate() accepts either.
  requiredFields: ['apiKey'],
  async send(phone, message, config) {
    const auth = ugaTextAuthHeaders(config);
    if (!auth) return { success: false, error: 'UgaText API key (or Client ID + Client Secret) is required' };
    const normalized = normalizePhoneNumber(phone);
    if (!normalized) return { success: false, error: 'Invalid phone number format' };
    // Sender ID is optional at every level: the school's own sender ID (merged into
    // config.senderId by the router), else the provider's configured one, else
    // UgaText's account default.
    const requestedSender = requireValue(config, 'senderId') || UGATEXT_DEFAULT_SENDER_ID;
    const post = async (senderId: string) => {
      const response = await ugaTextFetch(config, '/messages', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': randomUUID() },
        body: JSON.stringify({ to: normalized.replace(/^\+/, ''), senderId, message }),
      });
      return { response, body: (await response.json().catch(() => ({}))) as any };
    };
    try {
      let senderUsed = requestedSender;
      let { response, body } = await post(senderUsed);
      // A school's custom sender ID may be registered with another provider but not on
      // UgaText. A rejected send is not delivered, so retrying once with the account
      // default keeps the school's messages flowing instead of failing every send.
      const senderRejected = !response.ok && response.status !== 401 && response.status !== 403 && /sender/i.test(ugaTextErrorText(body));
      if (senderRejected && senderUsed !== UGATEXT_DEFAULT_SENDER_ID) {
        senderUsed = UGATEXT_DEFAULT_SENDER_ID;
        ({ response, body } = await post(senderUsed));
      }
      const status = String(body?.status || '').toLowerCase();
      const accepted = response.ok && body?.success !== false && UGATEXT_ACCEPTED.includes(status);
      if (!accepted) return { success: false, status: body?.status || `HTTP ${response.status}`, error: ugaTextError(body, response.status), details: body };
      const messageId = body?.message_id ?? body?.messageId ?? body?.id ?? body?.data?.message_id ?? body?.data?.id ?? null;
      const cost = body?.cost_ugx ?? body?.estimated_cost;
      return {
        success: true,
        status: body?.status || 'Accepted',
        messageId: messageId == null ? undefined : String(messageId),
        cost: cost == null ? undefined : `${body?.currency || 'UGX'} ${cost}`,
        phone: normalized,
        details: { ...body, sender_id_requested: requestedSender, sender_id_used: senderUsed },
      };
    } catch (error: any) {
      return { success: false, error: error?.message || 'UgaText request failed' };
    }
  },
  async getBalance(config) {
    const auth = ugaTextAuthHeaders(config);
    if (!auth) return { supported: true, ok: false, amount: null, currency: null, units: null, error: 'UgaText API key (or Client ID + Client Secret) is required' };
    try {
      const response = await ugaTextFetch(config, '/account/balance', { headers: { ...auth, Accept: 'application/json' } });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.success === false) return { supported: true, ok: false, amount: null, currency: null, units: null, error: ugaTextError(body, response.status) };
      const units = body?.sms_balance_units ?? body?.sms_units_remaining ?? body?.estimated_messages ?? body?.estimated_sms_units;
      return { supported: true, ok: true, amount: Number(body?.balance_ugx ?? body?.balance ?? 0), currency: body?.currency || 'UGX', units: units == null ? null : Number(units) };
    } catch (error: any) {
      return { supported: true, ok: false, amount: null, currency: null, units: null, error: error?.message || 'Balance request failed' };
    }
  },
  async validate(config) {
    if (!ugaTextAuthHeaders(config)) return { ok: false, status: 'configuration_incomplete', message: 'Missing: apiKey (or clientId + clientSecret)' };
    const balance = await this.getBalance(config);
    return balance.ok ? { ok: true, status: 'connected', balance } : { ok: false, status: 'authentication_failed', message: balance.error || 'Provider validation failed', balance };
  },
};

/** UgaText delivery status for a message ID returned by send(): queued | sent | delivered | failed | rejected. */
export async function getUgaTextMessageStatus(messageId: string, config: SmsProviderConfig): Promise<{ ok: boolean; status: string | null; deliveredAt: string | null; failureReason: string | null; error?: string }> {
  const auth = ugaTextAuthHeaders(config);
  if (!auth) return { ok: false, status: null, deliveredAt: null, failureReason: null, error: 'UgaText credentials missing' };
  try {
    const response = await ugaTextFetch(config, `/messages/${encodeURIComponent(messageId)}`, { headers: { ...auth, Accept: 'application/json' } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, status: null, deliveredAt: null, failureReason: null, error: ugaTextError(body, response.status) };
    return { ok: true, status: body?.status ?? null, deliveredAt: body?.delivered_at ?? null, failureReason: body?.failure_reason ?? null };
  } catch (error: any) {
    return { ok: false, status: null, deliveredAt: null, failureReason: null, error: error?.message || 'Status request failed' };
  }
}

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
