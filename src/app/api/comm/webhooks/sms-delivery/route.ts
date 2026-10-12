/**
 * SMS delivery-report webhook (Africa's Talking "Delivery Reports" callback).
 *
 * This is the ONLY thing that can turn an SMS from SENT (provider accepted) into DELIVERED. Without it
 * DRAIS honestly stays at SENT.
 *
 * Setup: in the provider dashboard set the delivery-report callback URL to
 *   https://<your-domain>/api/comm/webhooks/sms-delivery?token=<SMS_DLR_SECRET>
 * The endpoint is disabled (503) until SMS_DLR_SECRET is set, and rejects any other token.
 * Idempotent: a message that is already confirmed is never changed, and a status never regresses.
 */
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { applyDeliveryReport } from '@/lib/sms/delivery-report';
import { normalizeDeliveryStatus } from '@/lib/notifications/outbox-query';

export const runtime = 'nodejs';

const safeEq = (a: string, b: string) => {
  const x = Buffer.from(a); const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function POST(req: NextRequest) {
  const secret = process.env.SMS_DLR_SECRET;
  if (!secret) return NextResponse.json({ error: 'SMS delivery reports are not configured' }, { status: 503 });
  const token = req.nextUrl.searchParams.get('token') ?? req.headers.get('x-dlr-secret') ?? '';
  if (!safeEq(token, secret)) return NextResponse.json({ error: 'Invalid credential' }, { status: 401 });

  const ct = req.headers.get('content-type') ?? '';
  let f: Record<string, string> = {};
  try {
    if (ct.includes('application/json')) f = await req.json();
    else { const p = new URLSearchParams(await req.text()); p.forEach((v, k) => { f[k] = v; }); }
  } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const messageId = String(f.id ?? f.messageId ?? '').slice(0, 120);
  if (!messageId) return NextResponse.json({ success: true, updated: 0, note: 'no message id' });
  const state = normalizeDeliveryStatus(f.status);
  const reason = String(f.failureReason ?? f.reason ?? '').slice(0, 120);

  const { updated } = await applyDeliveryReport({
    messageId, state, reason: reason || String(f.status ?? ''),
    provider: 'africas_talking', providerStatus: String(f.status ?? '').slice(0, 60), network: f.networkCode ? String(f.networkCode) : null,
  });
  return NextResponse.json({ success: true, updated, state });
}
