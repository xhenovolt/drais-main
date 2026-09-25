/**
 * MarzPay (https://wallet.wearemarz.com) mobile-money collections. Server-side only.
 *
 * Credentials are read from the environment at call time (never bundled, never returned to a browser):
 *   MARZPAY_API_KEY, MARZPAY_API_SECRET   -> HTTP Basic auth (base64 "key:secret")
 *   MARZPAY_BASE_URL                      -> default https://wallet.wearemarz.com/api/v1
 *   MARZPAY_WEBHOOK_SECRET                -> optional webhook signing secret (defence in depth)
 *
 * Endpoints used (per MarzPay docs):
 *   POST {base}/collect-money            start a mobile-money collection (customer gets a USSD/app prompt)
 *   GET  {base}/collect-money/{uuid}     authoritative status of a collection
 *   GET  {base}/collect-money/services   available services (used only to verify credentials; moves no money)
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { parseSignatureHeader } from '@/lib/sms/topup-math';

const DEFAULT_BASE = 'https://wallet.wearemarz.com/api/v1';

export function marzConfig(): { key: string; secret: string; base: string; webhookSecret: string | null } | null {
  const key = process.env.MARZPAY_API_KEY?.trim();
  const secret = process.env.MARZPAY_API_SECRET?.trim();
  if (!key || !secret) return null;
  return {
    key, secret,
    base: (process.env.MARZPAY_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, ''),
    webhookSecret: process.env.MARZPAY_WEBHOOK_SECRET?.trim() || null,
  };
}

export const marzConfigured = (): boolean => marzConfig() !== null;

const authHeader = (c: NonNullable<ReturnType<typeof marzConfig>>) => `Basic ${Buffer.from(`${c.key}:${c.secret}`).toString('base64')}`;

export interface MarzTransaction {
  uuid: string | null;
  reference: string | null;
  status: string | null;
  mode: string | null;
  currency: string | null;
  amountRaw: number | null;
  provider: string | null;
  raw: unknown;
}

/** Tolerant reader: MarzPay nests the same fields under data.transaction / data.collection (create + get) or transaction / collection (webhook). */
export function readTransaction(body: any): MarzTransaction {
  const root = body?.data ?? body ?? {};
  const t = root.transaction ?? {};
  const c = root.collection ?? {};
  const amount = c.amount ?? t.amount ?? {};
  const raw = amount?.raw ?? amount?.value ?? null;
  return {
    uuid: t.uuid ?? null,
    reference: t.reference ?? null,
    status: t.status ?? c.status ?? null,
    mode: c.mode ?? t.mode ?? null,
    currency: amount?.currency ?? null,
    amountRaw: raw == null ? null : Number(raw),
    provider: c.provider ?? t.provider ?? null,
    raw: undefined,
  };
}

async function call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<{ ok: boolean; status: number; json: any }> {
  const c = marzConfig();
  if (!c) return { ok: false, status: 0, json: { message: 'MarzPay is not configured' } };
  try {
    const res = await fetch(`${c.base}${path}`, {
      method,
      headers: { Authorization: authHeader(c), Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(25_000),
    });
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, json };
  } catch (e: any) {
    return { ok: false, status: 0, json: { message: e?.name === 'TimeoutError' ? 'MarzPay did not answer in time' : (e?.message || 'Network error') } };
  }
}

export interface CollectInput { amountUgx: number; phone: string; reference: string; description: string; callbackUrl?: string | null; metadata?: Array<Record<string, string>> }

export async function collectMoney(i: CollectInput): Promise<{ ok: boolean; tx: MarzTransaction | null; error?: string }> {
  const r = await call('POST', '/collect-money', {
    amount: i.amountUgx, country: 'UG', reference: i.reference, phone_number: i.phone,
    description: i.description.slice(0, 255),
    ...(i.callbackUrl ? { callback_url: i.callbackUrl.slice(0, 255) } : {}),
    ...(i.metadata?.length ? { metadata: i.metadata.slice(0, 10) } : {}),
  });
  if (!r.ok || String(r.json?.status ?? '').toLowerCase() === 'error') {
    const msg = r.json?.message || r.json?.error || `MarzPay returned HTTP ${r.status}`;
    return { ok: false, tx: null, error: String(msg).slice(0, 240) };
  }
  return { ok: true, tx: readTransaction(r.json) };
}

export async function getCollection(uuid: string): Promise<{ ok: boolean; tx: MarzTransaction | null; error?: string }> {
  if (!/^[0-9a-fA-F-]{20,64}$/.test(uuid)) return { ok: false, tx: null, error: 'Invalid transaction id' };
  const r = await call('GET', `/collect-money/${encodeURIComponent(uuid)}`);
  if (!r.ok) return { ok: false, tx: null, error: String(r.json?.message || `MarzPay returned HTTP ${r.status}`).slice(0, 240) };
  return { ok: true, tx: readTransaction(r.json) };
}

/** Credential check that moves no money. */
export async function verifyCredentials(): Promise<{ ok: boolean; message: string }> {
  if (!marzConfigured()) return { ok: false, message: 'MARZPAY_API_KEY / MARZPAY_API_SECRET are not set' };
  const r = await call('GET', '/collect-money/services');
  if (r.ok) return { ok: true, message: 'MarzPay accepted the credentials' };
  if (r.status === 401 || r.status === 403) return { ok: false, message: `MarzPay rejected the credentials (HTTP ${r.status})` };
  return { ok: false, message: String(r.json?.message || `MarzPay returned HTTP ${r.status}`).slice(0, 200) };
}

/**
 * Verify X-MarzPay-Signature (`t=<ts>,v1=<hex>` = HMAC-SHA256(secret, `${ts}.${rawBody}`)) with a 5-minute window
 * and constant-time comparison. Returns 'unsigned' when no header is present so the caller can decide.
 */
export function verifyWebhookSignature(rawBody: string, header: string | null, secret: string, nowMs = Date.now()): 'valid' | 'invalid' | 'unsigned' {
  if (!header) return 'unsigned';
  const sig = parseSignatureHeader(header);
  if (!sig) return 'invalid';
  if (Math.abs(nowMs / 1000 - Number(sig.t)) > 300) return 'invalid';
  const expected = createHmac('sha256', secret).update(`${sig.t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected); const b = Buffer.from(sig.v1);
  return a.length === b.length && timingSafeEqual(a, b) ? 'valid' : 'invalid';
}
