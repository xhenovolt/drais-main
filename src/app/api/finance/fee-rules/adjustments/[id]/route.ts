/**
 * PATCH  /api/finance/fee-rules/adjustments/[id] — approve/reject/pending.
 * DELETE /api/finance/fee-rules/adjustments/[id] — remove.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { setAdjustmentStatus, deleteAdjustment } from '@/lib/finance/feeRules';
import { checkModule } from '@/lib/auth/requireModule';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const status = b?.status;
  if (!['approved', 'rejected', 'pending'].includes(status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  await setAdjustmentStatus(session.schoolId, Number(id), status, session.userId, b?.rejection_reason ?? null);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({} as any));
  await deleteAdjustment(session.schoolId, Number(id), session.userId, b?.reason ?? null);
  return NextResponse.json({ success: true });
}
