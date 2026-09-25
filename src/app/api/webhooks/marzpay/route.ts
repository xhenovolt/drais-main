/**
 * MarzPay payment callback (collection.completed / collection.failed).
 *
 * A callback body is NEVER trusted to credit SMS. It is only a nudge: we find our purchase by the reference
 * and then ask MarzPay directly (authenticated) what really happened (syncTopup). If a signing secret is
 * configured and a signature is present it must be valid, which also blocks junk. Returns 200 for anything
 * we handled or don't recognise so MarzPay stops retrying; 401 only for a bad signature.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { marzConfig, readTransaction, verifyWebhookSignature } from '@/lib/payments/marzpay';
import { syncTopup } from '@/lib/sms/topup';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const cfg = marzConfig();
  if (!cfg) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const raw = await req.text();
  if (cfg.webhookSecret) {
    const v = verifyWebhookSignature(raw, req.headers.get('x-marzpay-signature'), cfg.webhookSecret);
    if (v === 'invalid') return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    // 'unsigned' is tolerated: safety comes from the authenticated lookup below, not from this header.
  }

  let body: any = null;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ success: true, ignored: 'not json' }); }
  const tx = readTransaction(body);
  const reference = tx.reference && /^[0-9a-fA-F-]{36}$/.test(tx.reference) ? tx.reference : null;
  if (!reference) return NextResponse.json({ success: true, ignored: 'no reference' });

  const row = ((await query(`SELECT id FROM sms_topups WHERE reference = ? LIMIT 1`, [reference])) as any[])[0];
  if (!row) return NextResponse.json({ success: true, ignored: 'unknown reference' });

  const r = await syncTopup(Number(row.id));
  return NextResponse.json({ success: true, status: r.status });
}
