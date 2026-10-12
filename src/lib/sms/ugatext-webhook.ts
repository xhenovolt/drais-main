/**
 * UgaText webhook verification + payload reading. PURE (no DB, no env) so it is unit-testable.
 *
 * UgaText POSTs a signed JSON event whenever a message changes state. Verified against a live
 * dispatch (2026-10-11):
 *   header  X-UgaText-Signature: t=<unix seconds>,v1=<hex hmac>
 *   v1    = HMAC-SHA256(signingSecret, `${t}.${rawBody}`)
 *   body  = { id, event, delivery_id, created_at, data: { message_id, recipient, status, ... } }
 * The dashboard simulator wraps the event one level deeper (data.data), so the reader looks for the
 * object that actually carries the message id rather than assuming a depth.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const UGATEXT_SIGNATURE_HEADER = 'x-ugatext-signature';
/** Reject signatures older/newer than this — limits replay of a captured request. */
export const UGATEXT_SIGNATURE_TOLERANCE_SECONDS = 600;

export type UgaTextSignatureResult = { ok: true; scheme: string } | { ok: false; reason: string };

const safeEqual = (a: Buffer, b: Buffer) => a.length === b.length && a.length > 0 && timingSafeEqual(a, b);

/** A secret-free description of a signature header ("t=<num:10>,v1=<hex:64>") for diagnostics. */
export function describeSignatureHeader(header: string | null | undefined): string {
  if (!header) return '(none)';
  return header.slice(0, 200)
    .replace(/[0-9a-f]{16,}/gi, (m) => `<hex:${m.length}>`)
    .replace(/[A-Za-z0-9+/_-]{20,}={0,2}/g, (m) => `<b64:${m.length}>`)
    .replace(/\d{6,}/g, (m) => `<num:${m.length}>`);
}

/**
 * Verify an UgaText webhook signature. Every accepted form is an HMAC-SHA256 keyed with the signing
 * secret — only the framing differs, because UgaText's simulator and its live message pipeline do
 * not frame it the same way (observed 2026-10-12: live `message.sent` events do not use the
 * documented `t=...,v1=...` header):
 *   documented   X-UgaText-Signature: t=<unix>,v1=<hex>     over "<t>.<raw body>"
 *   bare         X-UgaText-Signature: [sha256=]<hex|base64> over "<raw body>", or over
 *                "<X-UgaText-Timestamp>.<raw body>" when that header is present
 * Timestamped forms are replay-limited by `toleranceSeconds`; the body-only form has no timestamp to
 * check, which is acceptable because applying a delivery report is idempotent.
 */
export function verifyUgaTextSignature(
  header: string | null | undefined, rawBody: string, secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000), toleranceSeconds: number = UGATEXT_SIGNATURE_TOLERANCE_SECONDS,
  timestampHeader?: string | null,
): UgaTextSignatureResult {
  if (!secret) return { ok: false, reason: 'no signing secret configured' };
  if (!header || !header.trim()) return { ok: false, reason: 'missing signature header' };
  const mac = (payload: string) => createHmac('sha256', secret).update(payload).digest();
  const fresh = (ts: string) => { const n = Number(ts.length > 11 ? Number(ts) / 1000 : ts); return Number.isFinite(n) && Math.abs(nowSeconds - n) <= toleranceSeconds; };

  // Documented form.
  if (/(^|,)\s*t=/.test(header) && /(^|,)\s*v1=/.test(header)) {
    const parts = Object.fromEntries(header.split(',').map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
    if (!/^\d+$/.test(parts.t || '') || !/^[0-9a-f]{64}$/i.test(parts.v1 || '')) return { ok: false, reason: 'malformed signature header' };
    if (!fresh(parts.t)) return { ok: false, reason: 'signature timestamp outside tolerance' };
    return safeEqual(Buffer.from(parts.v1, 'hex'), mac(`${parts.t}.${rawBody}`)) ? { ok: true, scheme: 't.body' } : { ok: false, reason: 'signature mismatch' };
  }

  // Bare digest, optionally prefixed ("sha256=", "v1=").
  const value = header.trim().replace(/^(sha256|v1|hmac-sha256)[=:]\s*/i, '');
  let given: Buffer | null = null;
  if (/^[0-9a-f]{64}$/i.test(value)) given = Buffer.from(value, 'hex');
  else if (/^[A-Za-z0-9+/_-]{43}=?$/.test(value)) given = Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (!given || given.length !== 32) return { ok: false, reason: 'malformed signature header' };
  const ts = (timestampHeader || '').trim();
  if (/^\d+$/.test(ts) && safeEqual(given, mac(`${ts}.${rawBody}`))) {
    return fresh(ts) ? { ok: true, scheme: 'timestamp-header.body' } : { ok: false, reason: 'signature timestamp outside tolerance' };
  }
  return safeEqual(given, mac(rawBody)) ? { ok: true, scheme: 'body' } : { ok: false, reason: 'signature mismatch' };
}

export type UgaTextDeliveryState = 'delivered' | 'failed' | 'pending' | 'unknown';

export interface UgaTextEvent {
  eventId: string | null;
  eventType: string;
  messageId: string | null;
  state: UgaTextDeliveryState;
  recipient: string | null;
  network: string | null;
  reason: string | null;
  deliveredAt: string | null;
  /** true for events that are not about a message at all (wallet.topup, balance alerts, ...). */
  nonMessage: boolean;
}

const DELIVERED = ['delivered', 'success', 'deliveredtoterminal'];
const FAILED = ['failed', 'rejected', 'undelivered', 'expired', 'bounced', 'blocked'];
const PENDING = ['sent', 'queued', 'accepted', 'submitted', 'pending', 'scheduled', 'buffered'];

function stateFrom(raw: unknown): UgaTextDeliveryState {
  const s = String(raw ?? '').trim().toLowerCase();
  if (DELIVERED.includes(s)) return 'delivered';
  if (FAILED.includes(s)) return 'failed';
  if (PENDING.includes(s)) return 'pending';
  return 'unknown';
}

export function readUgaTextEvent(body: any): UgaTextEvent {
  // Walk down nested `data` until the object carrying the message id (max 3 levels).
  let payload: any = body;
  let eventType = String(body?.event ?? '');
  for (let depth = 0; depth < 3 && payload && payload.message_id == null && payload.messageId == null && payload.data; depth++) {
    payload = payload.data;
    if (payload?.event) eventType = String(payload.event);
  }
  const messageId = payload?.message_id ?? payload?.messageId ?? null;
  // The event name is authoritative (sms.failed / message.delivered); the status field is the
  // fallback. The simulator sends status:"delivered" even on its sms.failed sample.
  const suffix = eventType.split('.').pop() ?? '';
  const fromEvent = stateFrom(suffix);
  const state = fromEvent !== 'unknown' ? fromEvent : stateFrom(payload?.status);
  const isMessageEvent = /^(sms|message)\./i.test(eventType) || messageId != null;
  return {
    eventId: body?.id ?? body?.event_id ?? payload?.event_id ?? null,
    eventType,
    messageId: messageId == null ? null : String(messageId).slice(0, 120),
    state: isMessageEvent ? state : 'unknown',
    recipient: payload?.recipient ?? payload?.phone ?? null,
    network: payload?.network ?? payload?.carrier_network ?? null,
    reason: payload?.failure_reason ?? payload?.reason ?? payload?.error ?? null,
    deliveredAt: payload?.delivered_at ?? null,
    nonMessage: !isMessageEvent,
  };
}
