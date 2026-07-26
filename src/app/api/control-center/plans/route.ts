/**
 * Control Center — subscription plan catalog API (Roadmap P5 / full CRUD).
 *   GET             → all plans + per-plan school count + the module catalog
 *   POST            → create/update a plan { code, name, tier?, limits?, features?, is_active? }
 *   DELETE ?code=   → remove a plan (refused while schools are still assigned)
 * Read requires a control session; write/delete require canManage. Audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { listPlans, upsertPlan, deletePlan } from '@/lib/control/subscriptions';
import { MODULE_CATALOG } from '@/lib/school-modules';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const plans = await listPlans().catch(() => []);
  const counts = (await query(
    `SELECT subscription_plan code, COUNT(*) n FROM schools
      WHERE deleted_at IS NULL AND subscription_plan IS NOT NULL GROUP BY subscription_plan`, [],
  ).catch(() => [])) as any[];
  const byCode = new Map(counts.map((r: any) => [r.code, Number(r.n)]));
  return NextResponse.json({
    success: true,
    plans: plans.map(p => ({ ...p, schools: byCode.get(p.code) || 0 })),
    module_catalog: MODULE_CATALOG.map(m => ({ code: m.code, label: m.label })),
  });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'plans.catalog')) return NextResponse.json({ error: 'You do not have permission to manage plans' }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (!b?.code || !b?.name) return NextResponse.json({ error: 'code and name are required' }, { status: 400 });

  try {
    const plan = await upsertPlan({
      code: String(b.code), name: String(b.name), tier: Number(b.tier) || 0,
      limits: b.limits && typeof b.limits === 'object' ? b.limits : {},
      features: Array.isArray(b.features) ? b.features.map(String) : [],
      is_active: b.is_active !== false,
      price: Number(b.price) || 0, installation_fee: Number(b.installation_fee) || 0,
      currency: b.currency ? String(b.currency) : 'UGX',
      billing_cycle: b.billing_cycle, installments: Number(b.installments) || 1,
      deliverables: Array.isArray(b.deliverables) ? b.deliverables.map(String) : [],
    });
    await controlAudit(user.id, 'plan_saved', `plans:${plan.code}`, { name: plan.name, tier: plan.tier }, clientIp(req));
    return NextResponse.json({ success: true, plan });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save plan' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'plans.catalog')) return NextResponse.json({ error: 'You do not have permission to manage plans' }, { status: 403 });
  const code = new URL(req.url).searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'code is required' }, { status: 400 });
  const res = await deletePlan(code, user.id, clientIp(req));
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 409 });
  return NextResponse.json({ success: true });
}
