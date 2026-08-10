/**
 * PATCH /api/finance/budgets/[id] — change budget status (approve / close / draft).
 * Body: { status: 'approved' | 'closed' | 'draft' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { setBudgetStatus } from '@/lib/finance/budgets';
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
  const body = await req.json().catch(() => ({}));
  const status = body?.status;
  if (!['approved', 'closed', 'draft'].includes(status)) {
    return NextResponse.json({ error: "status must be 'approved', 'closed' or 'draft'" }, { status: 400 });
  }
  try {
    await setBudgetStatus(session.schoolId, Number(id), status, session.userId);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
