/**
 * DELETE /api/finance/fee-rules/rules/[id] — remove an eligibility rule.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { deleteRule } from '@/lib/finance/feeRules';

export const runtime = 'nodejs';

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }
  const { id } = await ctx.params;
  await deleteRule(session.schoolId, Number(id));
  return NextResponse.json({ success: true });
}
