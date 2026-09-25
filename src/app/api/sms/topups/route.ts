/**
 * GET  /api/sms/topups            — price per SMS for this school, limits, recent purchases, current balance.
 * POST /api/sms/topups {amount, phone} — start buying SMS: the payer gets a mobile-money prompt on `phone`.
 *
 * The school always comes from the session. Only school administrators can buy.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { canAny } from '@/lib/rbac/fallback';
import { createTopup, getSchoolPrice, listTopups } from '@/lib/sms/topup';
import { MAX_TOPUP_UGX, MIN_TOPUP_UGX, quoteTopup } from '@/lib/sms/topup-math';
import { getSmsPosition } from '@/lib/sms/usage';
import { marzConfigured } from '@/lib/payments/marzpay';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function gate(req: NextRequest) {
  const s = await getSessionSchoolId(req);
  if (!s) return { err: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const g = { userId: s.userId, schoolId: s.schoolId, isSuperAdmin: !!s.isSuperAdmin };
  if (!(await canAny(g, ['comm.settings.manage', 'comm.dispatch.send'], ['admin']))) {
    return { err: NextResponse.json({ error: 'Only a school administrator can buy SMS' }, { status: 403 }) };
  }
  return { s: g };
}

function callbackUrl(req: NextRequest): string | null {
  const configured = process.env.APP_PUBLIC_URL?.trim().replace(/\/+$/, '');
  const base = configured || (req.nextUrl.protocol === 'https:' ? req.nextUrl.origin : '');
  return base ? `${base}/api/webhooks/marzpay` : null;   // no public https URL (e.g. the phone app) -> rely on status polling
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ('err' in g && g.err) return g.err;
  const { schoolId } = g.s!;
  const [price, position, topups] = await Promise.all([getSchoolPrice(schoolId), getSmsPosition(schoolId), listTopups(schoolId, 20)]);
  return NextResponse.json({
    success: true, configured: marzConfigured(),
    price: { perSmsUgx: price.priceUgx, enabled: price.topupEnabled },
    limits: { minUgx: MIN_TOPUP_UGX, maxUgx: MAX_TOPUP_UGX },
    balance: { quota: position.quota, used: position.used, remaining: position.remaining },
    topups: topups.map((t) => ({
      id: Number(t.id), amountUgx: Number(t.amount_ugx), sms: Number(t.sms_units), status: t.status,
      phone: t.phone_masked, reason: t.failure_reason, createdAt: t.created_at, creditedAt: t.credited_at,
    })),
  });
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ('err' in g && g.err) return g.err;
  const { schoolId, userId } = g.s!;
  const body = await req.json().catch(() => null) as any;
  const amount = Number(body?.amount);
  const phone = typeof body?.phone === 'string' ? body.phone : '';

  // Quote-only (no money moves): lets the page show "UGX 300,000 = 10,000 SMS" from the server's own price.
  if (body?.quoteOnly) {
    const price = await getSchoolPrice(schoolId);
    const q = quoteTopup(amount, price.priceUgx);
    return q.ok ? NextResponse.json({ success: true, quote: q }) : NextResponse.json({ error: q.error }, { status: 400 });
  }

  const r = await createTopup({ schoolId, userId, requestedUgx: amount, phone, callbackUrl: callbackUrl(req) });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.id ? 502 : 400 });
  return NextResponse.json({ success: true, id: r.id, status: r.status, sms: r.units, amountUgx: r.amountUgx });
}
