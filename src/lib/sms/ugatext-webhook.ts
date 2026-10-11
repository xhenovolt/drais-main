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

export type UgaTextSignatureResult = { ok: true } | { ok: false; reason: string };

export function verifyUgaTextSignature(
  header: string | null | undefined, rawBody: string, secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000), toleranceSeconds: number = UGATEXT_SIGNATURE_TOLERANCE_SECONDS,
): UgaTextSignatureResult {
  if (!secret) return { ok: false, reason: 'no signing secret configured' };
  if (!header) return { ok: false, reason: 'missing signature header' };
  const parts = Object.fromEntries(header.split(',').map((p) => { const i = p.indexOf('='); return [p.slice(0, i).trim(), p.slice(i + 1).trim()]; }));
  const timestamp = Number(parts.t);
  const signature = String(parts.v1 || '');
  if (!Number.isFinite(timestamp) || !/^[0-9a-f]{64}$/i.test(signature)) return { ok: false, reason: 'malformed signature header' };
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return { ok: false, reason: 'signature timestamp outside tolerance' };
  const expected = createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest();
  const given = Buffer.from(signature, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected) ? { ok: true } : { ok: false, reason: 'signature mismatch' };
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
