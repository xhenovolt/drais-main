/**
 * Control Center — SMS selling price + online top-ups.
 *   GET  → default price, per-school prices, MarzPay status, recent purchases and totals.
 *   PUT  { defaultPriceUgx }                                 → change the default price per SMS
 *   PUT  { schoolIds: number[]|'all', priceUgx: number|null, topupEnabled?: boolean }
 *                                                            → per-school price (null = back to default) and buying on/off
 *   POST { action: 'verify' }                                → check the MarzPay credentials (moves no money)
 *   POST { action: 'recheck', topupId }                      → ask MarzPay again about a purchase and credit it if really paid
 * Control-session gated and audited. Credentials are never returned.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { query } from '@/lib/db';
import { getSmsPricing, setSmsPricing } from '@/lib/control/sms-economics';
import { marzConfigured, verifyCredentials } from '@/lib/payments/marzpay';
import { syncTopup } from '@/lib/sms/topup';

export const runtime = 'nodejs';
export const maxDuration = 60;

const validPrice = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 10_000;

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'sms.balance.view')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const [pricing, schools, prices, sums, recent] = await Promise.all([
    getSmsPricing(),
    query(`SELECT id, name FROM schools WHERE deleted_at IS NULL ORDER BY name ASC`, []).catch(() => []) as Promise<any[]>,
    query(`SELECT school_id, price_ugx, topup_enabled FROM sms_school_prices`, []).catch(() => []) as Promise<any[]>,
    query(`SELECT school_id, COUNT(*) n, SUM(CASE WHEN status = 'credited' THEN amount_ugx ELSE 0 END) paid, SUM(CASE WHEN status = 'credited' THEN sms_units ELSE 0 END) sms
             FROM sms_topups GROUP BY school_id`, []).catch(() => []) as Promise<any[]>,
    query(`SELECT t.id, t.school_id, s.name AS school_name, t.amount_ugx, t.sms_units, t.status, t.failure_reason, t.phone_masked, t.created_at, t.credited_at
             FROM sms_topups t LEFT JOIN schools s ON s.id = t.school_id ORDER BY t.id DESC LIMIT 50`, []).catch(() => []) as Promise<any[]>,
  ]);
  const priceBy = new Map(prices.map((p) => [Number(p.school_id), p]));
  const sumBy = new Map(sums.map((p) => [Number(p.school_id), p]));

  return NextResponse.json({
    success: true,
    canManage: controlCan(user.role, 'billing.manage'),
    marzConfigured: marzConfigured(),
    defaultPriceUgx: pricing.retailPrice,
    internalCostUgx: pricing.internalCost,
    schools: schools.map((s) => {
      const id = Number(s.id); const o = priceBy.get(id); const sm = sumBy.get(id);
      const override = o && o.price_ugx != null ? Number(o.price_ugx) : null;
      return {
        id, name: s.name, overrideUgx: override, priceUgx: override ?? pricing.retailPrice,
        topupEnabled: o ? Number(o.topup_enabled) === 1 : true, purchases: Number(sm?.n ?? 0), paidUgx: Number(sm?.paid ?? 0), sms: Number(sm?.sms ?? 0),
      };
    }),
    totals: {
      paidUgx: sums.reduce((a, r) => a + Number(r.paid ?? 0), 0), sms: sums.reduce((a, r) => a + Number(r.sms ?? 0), 0),
      needsReview: recent.filter((r) => r.status === 'review').length,
    },
    recent: recent.map((r) => ({
      id: Number(r.id), schoolId: Number(r.school_id), school: r.school_name, amountUgx: Number(r.amount_ugx), sms: Number(r.sms_units),
      status: r.status, reason: r.failure_reason, phone: r.phone_masked, createdAt: r.created_at, creditedAt: r.credited_at,
    })),
  });
}

export async function PUT(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'billing.manage')) return NextResponse.json({ error: 'You do not have permission to change SMS prices' }, { status: 403 });
  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  if (body.defaultPriceUgx !== undefined) {
    if (!validPrice(body.defaultPriceUgx)) return NextResponse.json({ error: 'Enter a price between UGX 1 and 10,000 per SMS' }, { status: 400 });
    const cur = await getSmsPricing();
    const next = await setSmsPricing(cur.internalCost, body.defaultPriceUgx);
    await controlAudit(user.id, 'set_sms_default_price', 'platform', { from: cur.retailPrice, to: next.retailPrice }, clientIp(req)).catch(() => {});
    return NextResponse.json({ success: true, defaultPriceUgx: next.retailPrice });
  }

  const all = (await query(`SELECT id FROM schools WHERE deleted_at IS NULL`, []).catch(() => [])) as any[];
  const valid = new Set(all.map((s) => Number(s.id)));
  const targets = [...new Set<number>((body.schoolIds === 'all' ? [...valid] : Array.isArray(body.schoolIds) ? body.schoolIds.map(Number) : []).filter((n: number) => valid.has(n)))];
  if (targets.length === 0) return NextResponse.json({ error: 'Choose at least one school' }, { status: 400 });
  if (body.priceUgx !== null && body.priceUgx !== undefined && !validPrice(body.priceUgx)) return NextResponse.json({ error: 'Enter a price between UGX 1 and 10,000 per SMS' }, { status: 400 });

  if (body.priceUgx === undefined && body.topupEnabled === undefined) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 });
  // price: a number sets it, null clears it back to the platform default, undefined leaves it alone.
  const setPrice = body.priceUgx !== undefined;
  const setEnabled = body.topupEnabled !== undefined;
  for (let i = 0; i < targets.length; i += 100) {
    const chunk = targets.slice(i, i + 100);
    await query(
      `INSERT INTO sms_school_prices (school_id, price_ugx, topup_enabled, updated_by)
       VALUES ${chunk.map(() => '(?, ?, ?, ?)').join(', ')}
       ON DUPLICATE KEY UPDATE ${setPrice ? 'price_ugx = VALUES(price_ugx),' : ''} ${setEnabled ? 'topup_enabled = VALUES(topup_enabled),' : ''} updated_by = VALUES(updated_by)`,
      chunk.flatMap((id) => [id, setPrice ? body.priceUgx : null, setEnabled ? (body.topupEnabled ? 1 : 0) : 1, user.id]),
    );
  }
  await controlAudit(user.id, 'set_sms_school_price', `schools:${targets.length === valid.size ? 'all' : targets.slice(0, 20).join(',')}`,
    { priceUgx: body.priceUgx ?? null, topupEnabled: body.topupEnabled ?? null, count: targets.length }, clientIp(req)).catch(() => {});
  return NextResponse.json({ success: true, updated: targets.length });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'billing.manage')) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const body = await req.json().catch(() => null) as any;

  if (body?.action === 'verify') return NextResponse.json({ success: true, ...(await verifyCredentials()) });
  if (body?.action === 'recheck') {
    const id = Number(body.topupId);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'topupId required' }, { status: 400 });
    const r = await syncTopup(id, { force: true });
    await controlAudit(user.id, 'recheck_sms_topup', `sms_topup:${id}`, { status: r.status, credited: r.credited }, clientIp(req)).catch(() => {});
    return NextResponse.json({ success: true, status: r.status, credited: r.credited, reason: r.failureReason });
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
