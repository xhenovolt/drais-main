/**
 * UgaText delivery webhook — turns an SMS from SENT (UgaText accepted it) into DELIVERED or FAILED
 * (what the handset/network actually reported).
 *
 * Setup:
 *   1. Control Center → SMS → Providers → UgaText → Edit → "Webhook signing secret" (whsec_...).
 *      That encrypted value is what this endpoint reads. UGATEXT_WEBHOOK_SECRET in the environment
 *      is only a fallback for when no provider row carries one.
 *   2. UgaText dashboard → Developer Settings → Webhooks → Destination URL:
 *        https://<your-domain>/api/comm/webhooks/ugatext
 *
 * Every request must carry a valid X-UgaText-Signature; nothing is trusted or written otherwise.
 * Disabled (503) until a signing secret exists. Idempotent — UgaText retries are safe.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { decryptProviderConfig } from '@/lib/sms/providers';
import { applyDeliveryReport } from '@/lib/sms/delivery-report';
import { readUgaTextEvent, verifyUgaTextSignature, UGATEXT_SIGNATURE_HEADER } from '@/lib/sms/ugatext-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Signing secrets, Control Center first. Each carries the provider row it belongs to (null = env). */
async function signingSecrets(): Promise<Array<{ providerId: number | null; secret: string }>> {
  const out: Array<{ providerId: number | null; secret: string }> = [];
  const rows = (await query(
    `SELECT id, encrypted_config FROM sms_provider_configs WHERE provider_type = 'ugatext' ORDER BY is_active DESC, id ASC`, [],
  ).catch(() => [])) as any[];
  for (const row of rows) {
    try {
      const secret = String(decryptProviderConfig(String(row.encrypted_config)).webhookSecret || '').trim();
      if (secret) out.push({ providerId: Number(row.id), secret });
    } catch { /* unreadable config — skip, the env fallback may still apply */ }
  }
  const env = (process.env.UGATEXT_WEBHOOK_SECRET || '').replace(/^["']|["']$/g, '').trim();
  if (env && !out.some((s) => s.secret === env)) out.push({ providerId: rows[0] ? Number(rows[0].id) : null, secret: env });
  return out;
}

export async function POST(req: NextRequest) {
  const secrets = await signingSecrets();
  if (!secrets.length) return NextResponse.json({ error: 'UgaText webhooks are not configured' }, { status: 503 });

  const raw = await req.text();
  const header = req.headers.get(UGATEXT_SIGNATURE_HEADER);
  let matched: { providerId: number | null } | null = null;
  let reason = 'signature mismatch';
  for (const candidate of secrets) {
    const check = verifyUgaTextSignature(header, raw, candidate.secret);
    if (check.ok) { matched = candidate; break; }
    reason = check.reason;
  }
  if (!matched) {
    // Leave a trace when something that looks like UgaText is turned away, so "UgaText never
    // called" and "we rejected it" can be told apart in Control Center. No payload is trusted or
    // stored; at most one row a minute so the open endpoint cannot be used to flood the table.
    if (header) {
      const recent = (await query(
        `SELECT 1 FROM sms_provider_operations WHERE operation = 'delivery_report_rejected' AND created_at > NOW() - INTERVAL 1 MINUTE LIMIT 1`, [],
      ).catch(() => [1])) as unknown[];
      if (!recent.length) {
        await query(
          `INSERT INTO sms_provider_operations (provider_id, provider_type, operation, success, http_status, error_message, metadata_json)
           VALUES (?, 'ugatext', 'delivery_report_rejected', 0, 401, ?, ?)`,
          [secrets[0].providerId, `Webhook rejected: ${reason}`.slice(0, 500),
            JSON.stringify({ event: (req.headers.get('x-ugatext-event') || '').slice(0, 60), deliveryId: (req.headers.get('x-ugatext-delivery-id') || '').slice(0, 80), bodyBytes: raw.length })],
        ).catch(() => undefined);
      }
    }
    return NextResponse.json({ error: `Invalid signature: ${reason}` }, { status: 401 });
  }

  let body: any;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const event = readUgaTextEvent(body);

  let updated = 0;
  if (event.messageId && !event.nonMessage) {
    updated = (await applyDeliveryReport({ messageId: event.messageId, state: event.state, reason: event.reason })).updated;
  }

  // Audit trail next to the send operations, so Control Center can show what UgaText reported.
  await query(
    `INSERT INTO sms_provider_operations (provider_id, provider_type, operation, success, provider_message_id, recipient_phone, error_message, metadata_json)
     VALUES (?, 'ugatext', 'delivery_report', ?, ?, ?, ?, ?)`,
    [
      matched.providerId, event.state === 'failed' ? 0 : 1, event.messageId, event.recipient ? String(event.recipient).slice(0, 32) : null,
      event.state === 'failed' ? String(event.reason || 'Delivery failed').slice(0, 500) : null,
      JSON.stringify({ event: event.eventType, eventId: event.eventId, state: event.state, network: event.network, deliveredAt: event.deliveredAt, updated }),
    ],
  ).catch(() => undefined);

  return NextResponse.json({ received: true, event: event.eventType, state: event.state, updated });
}

/** Lets an operator (or UgaText's URL check) confirm the endpoint exists without exposing anything. */
export async function GET() {
  const configured = (await signingSecrets()).length > 0;
  return NextResponse.json({ endpoint: 'ugatext-webhook', configured }, { status: configured ? 200 : 503 });
}
