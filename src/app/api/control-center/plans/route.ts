/**
 * Control Center — subscription plan catalog API (Roadmap P5).
 *   GET  → all plans (seeded presets + operator-authored)
 *   POST → create/update a plan { code, name, tier?, limits?, features?, is_active? }
 * Read requires a control session; write requires canManage. Audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, canManage, controlAudit, clientIp } from '@/lib/control/auth';
import { listPlans, upsertPlan } from '@/lib/control/subscriptions';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const plans = await listPlans().catch(() => []);
  return NextResponse.json({ success: true, plans });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: 'Super admin role required' }, { status: 403 });

  const b = await req.json().catch(() => null);
  if (!b?.code || !b?.name) return NextResponse.json({ error: 'code and name are required' }, { status: 400 });

  try {
    const plan = await upsertPlan({
      code: String(b.code), name: String(b.name), tier: Number(b.tier) || 0,
      limits: b.limits && typeof b.limits === 'object' ? b.limits : {},
      features: Array.isArray(b.features) ? b.features.map(String) : [],
      is_active: b.is_active !== false,
    });
    await controlAudit(user.id, 'plan_saved', `plans:${plan.code}`, { name: plan.name, tier: plan.tier }, clientIp(req));
    return NextResponse.json({ success: true, plan });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to save plan' }, { status: 500 });
  }
}
