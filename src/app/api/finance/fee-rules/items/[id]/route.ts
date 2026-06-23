/**
 * PATCH  /api/finance/fee-rules/items/[id] — edit a fee item.
 * DELETE /api/finance/fee-rules/items/[id] — delete a fee item + its rules.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { updateFeeItem } from '@/lib/finance/feeRules';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }
  const { id } = await ctx.params;
  await updateFeeItem(session.schoolId, Number(id), await req.json().catch(() => ({})));
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }
  const { id } = await ctx.params;
  await query(`DELETE FROM fee_eligibility_rules WHERE fee_item_id = ? AND school_id = ?`, [Number(id), session.schoolId]);
  await query(`DELETE FROM fee_items WHERE id = ? AND school_id = ?`, [Number(id), session.schoolId]);
  return NextResponse.json({ success: true });
}
