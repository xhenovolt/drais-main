/**
 * One Control Center operator.
 * GET    → their recent Control Center activity (audit.view or operators.view)
 * PATCH  → change name / role / permissions / school scope / expiry / status /
 *          password, or end their sessions (operators.edit)
 * DELETE → remove them (operators.delete)
 * Rules live in lib/control/operators. Every change is audited with what changed.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/control/db';
import { controlAudit, clientIp } from '@/lib/control/auth';
import { requireControl } from '@/lib/control/guard';
import { updateOperator, deleteOperator } from '@/lib/control/operators';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const g = await requireControl(req, 'operators.view');
  if (g.res) return g.res;
  const id = Number((await ctx.params).id);
  const activity = (await query(
    `SELECT id, action, resource, metadata, ip, created_at FROM control_audit_logs
      WHERE user_id = ? ORDER BY id DESC LIMIT 50`, [id],
  ).catch(() => [])) as any[];
  const changes = (await query(
    `SELECT a.id, a.action, a.metadata, a.created_at, u.name AS by_name FROM control_audit_logs a
       LEFT JOIN control_users u ON u.id = a.user_id
      WHERE a.resource = ? ORDER BY a.id DESC LIMIT 30`, [`control_users:${id}`],
  ).catch(() => [])) as any[];
  return NextResponse.json({ success: true, activity, changes });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const g = await requireControl(req, 'operators.edit');
  if (g.res) return g.res;
  const id = Number((await ctx.params).id);
  const b = await req.json().catch(() => ({}));
  const r = await updateOperator(g.user, id, b || {});
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.status });
  await controlAudit(g.user.id, 'operator_updated', `control_users:${id}`, r.changes, clientIp(req));
  return NextResponse.json({ success: true, changes: r.changes });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const g = await requireControl(req, 'operators.delete');
  if (g.res) return g.res;
  const id = Number((await ctx.params).id);
  const r = await deleteOperator(g.user, id);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.status });
  await controlAudit(g.user.id, 'operator_removed', `control_users:${id}`, r.changes, clientIp(req));
  return NextResponse.json({ success: true });
}
