/**
 * Infobip WhatsApp delivery-status webhook — signature/auth verification
 * and status-mapping, mirroring src/lib/control/billing-webhook.ts's shape
 * (pure + unit-tested core, DB-touching shell kept separate).
 *
 * AUTH SCHEME NOTE: unlike the billing webhook (where the gateway computes
 * an HMAC-SHA256 over the raw body, a near-universal payment-gateway
 * convention), Infobip's own delivery-report webhooks don't have one fixed
 * signing scheme documented here to copy with confidence — Infobip's
 * portal lets you attach a CUSTOM header to the outbound webhook call when
 * you register the callback URL for a WhatsApp sender. This module verifies
 * a simple shared-secret header instead of HMAC-over-body for that reason:
 * it's the mechanism this session can be certain actually works, rather
 * than guessing at an HMAC scheme that might not match what Infobip sends.
 * Whoever registers the webhook URL in Infobip's WhatsApp sender settings
 * MUST add a custom header carrying INFOBIP_WEBHOOK_SECRET's value
 * (header name: x-infobip-webhook-secret, or Authorization: Bearer <secret>
 * — either is accepted).
 */
import { timingSafeEqual } from 'node:crypto';

/** PURE: constant-time shared-secret check. Accepts either a bearer token
 *  or a raw secret header value. */
export function verifyWebhookAuth(
  authHeader: string | null | undefined,
  secretHeader: string | null | undefined,
  secret: string | undefined,
): boolean {
  if (!secret) return false;
  const bearer = authHeader?.toLowerCase().startsWith('bearer ') ? authHeader.slice(7) : null;
  const provided = bearer ?? secretHeader ?? null;
  if (!provided) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';

export interface NormalizedDeliveryEvent {
  providerMessageId: string;
  status: DeliveryStatus;
  errorText: string | null;
}

/** PURE: map one Infobip `results[]` entry to our comm_dispatch_log status.
 *  Infobip's groupName values observed/documented: PENDING, PENDING_ENROUTE,
 *  DELIVERED, EXPIRED, REJECTED, UNDELIVERABLE — READ/SEEN group names for
 *  WhatsApp read receipts are less consistently documented across accounts,
 *  so both 'READ' and 'SEEN' are treated as read here; anything unrecognized
 *  falls through to null (caller skips it) rather than guessing wrong. */
export function normalizeDeliveryResult(r: any): NormalizedDeliveryEvent | null {
  const messageId = String(r?.messageId ?? '').trim();
  const groupName = String(r?.status?.groupName ?? '').toUpperCase();
  if (!messageId || !groupName) return null;

  let status: DeliveryStatus | null = null;
  if (groupName === 'DELIVERED') status = 'delivered';
  else if (groupName === 'READ' || groupName === 'SEEN') status = 'read';
  else if (groupName === 'REJECTED' || groupName === 'UNDELIVERABLE' || groupName === 'EXPIRED') status = 'failed';
  else if (groupName === 'PENDING' || groupName === 'PENDING_ENROUTE') status = 'sent'; // no-op, already 'sent'
  if (!status) return null;

  return {
    providerMessageId: messageId,
    status,
    errorText: r?.error?.groupName && r.error.groupName !== 'OK' ? String(r.error.description ?? r.error.groupName) : null,
  };
}

/** PURE: extract every result entry Infobip's payload shape can carry —
 *  observed as either `{ results: [...] }` or a bare array. */
export function extractResults(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.results)) return body.results;
  return [];
}

// ── DB-touching shell ───────────────────────────────────────────────────
import { query } from '@/lib/db';

/** Apply one normalized delivery event to comm_dispatch_log, idempotently —
 *  a status can only move forward (queued/sent → delivered → read; anything
 *  → failed), so a duplicate or out-of-order webhook delivery can never
 *  regress an already-more-advanced row. Matches on provider_message_id,
 *  which is unique per send (Infobip-assigned), not on any tenant column —
 *  this webhook has no session, so there is nothing to scope by; the
 *  message id itself is the only key available, same as the billing
 *  webhook keys purely on the gateway's own transaction id. */
const STATUS_RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, read: 3, failed: 4, skipped: 4 };

export async function applyDeliveryEvent(evt: NormalizedDeliveryEvent): Promise<{ updated: boolean; reason?: string }> {
  const rows = (await query(
    `SELECT id, status FROM comm_dispatch_log WHERE provider_message_id = ? LIMIT 1`,
    [evt.providerMessageId],
  )) as Array<{ id: number; status: string }>;
  if (!rows.length) return { updated: false, reason: 'no matching dispatch log row' };

  const current = rows[0];
  const currentRank = STATUS_RANK[current.status] ?? 0;
  const nextRank = STATUS_RANK[evt.status] ?? 0;
  if (nextRank < currentRank) return { updated: false, reason: 'stale event — status already more advanced' };
  if (nextRank === currentRank && current.status === evt.status) return { updated: true, reason: 'already at this status' };

  await query(
    `UPDATE comm_dispatch_log SET status = ?, error_message = COALESCE(?, error_message) WHERE id = ?`,
    [evt.status, evt.errorText, current.id],
  );
  return { updated: true };
}
