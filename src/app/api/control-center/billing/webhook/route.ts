/**
 * Control Center — payment-gateway webhook (Phase 12 / E-7).
 *   POST (from the gateway) → verify HMAC signature, record the payment,
 *        reconcile the invoice, auto-reactivate the school.
 *
 * Auth is by HMAC signature (no session — gateways don't have one). The shared
 * secret is `BILLING_WEBHOOK_SECRET`; if it's unset the endpoint is disabled
 * (503) so no unauthenticated payment can ever be injected. Idempotent on the
 * gateway transaction id.
 *
 * Expected JSON body: { invoice_id, amount, provider_ref|transaction_id,
 *                       method?, currency?, reference? }
 * Signature header: `x-billing-signature: sha256=<hmac-sha256(secret, rawBody)>`
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhookSignature, normalizeWebhookPayload, recordGatewayPayment } from '@/lib/control/billing-webhook';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const secret = process.env.BILLING_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'Payment webhook is not configured' }, { status: 503 });

  const raw = await req.text();
  const sig = req.headers.get('x-billing-signature');
  if (!verifyWebhookSignature(raw, sig, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let body: any = null;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const norm = normalizeWebhookPayload(body);
  if (!norm.ok) return NextResponse.json({ error: norm.reason }, { status: 400 });

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const res = await recordGatewayPayment(norm.payment!, ip);
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
  // Always 200 for a handled event (including idempotent duplicates) so the
  // gateway stops retrying.
  return NextResponse.json({ success: true, duplicate: !!res.duplicate, paid_in_full: !!res.paidInFull, new_end: res.newEnd ?? null });
}
