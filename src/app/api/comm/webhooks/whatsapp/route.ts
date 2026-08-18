/**
 * Infobip WhatsApp delivery-status webhook.
 *   POST (from Infobip) → verify shared-secret header, update
 *        comm_dispatch_log.status for each matching message
 *        (queued/sent → delivered → read, or → failed).
 *
 * Auth is a shared secret (INFOBIP_WEBHOOK_SECRET), not a session — see
 * src/lib/comm/whatsapp-webhook.ts's header comment for why this uses a
 * secret header rather than HMAC-over-body (unlike the billing webhook).
 * If the secret is unset the endpoint is disabled (503) so no
 * unauthenticated status update can ever be injected. Idempotent per
 * message id — a status can only move forward, never regress.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookAuth, extractResults, normalizeDeliveryResult, applyDeliveryEvent } from '@/lib/comm/whatsapp-webhook';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.INFOBIP_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'WhatsApp delivery webhook is not configured' }, { status: 503 });

  const auth = req.headers.get('authorization');
  const secretHeader = req.headers.get('x-infobip-webhook-secret');
  if (!verifyWebhookAuth(auth, secretHeader, secret)) {
    return NextResponse.json({ error: 'Invalid or missing webhook credential' }, { status: 401 });
  }

  const raw = await req.text();
  let body: any = null;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const results = extractResults(body);
  let updated = 0, skipped = 0;
  for (const r of results) {
    const evt = normalizeDeliveryResult(r);
    if (!evt) { skipped++; continue; }
    const res = await applyDeliveryEvent(evt).catch(() => ({ updated: false }));
    if (res.updated) updated++; else skipped++;
  }

  // Always 200 for a handled request (including all-skipped) so Infobip
  // stops retrying — matches the billing webhook's convention.
  return NextResponse.json({ success: true, results_received: results.length, updated, skipped });
}
