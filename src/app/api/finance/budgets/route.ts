/**
 * GET  /api/finance/budgets — budgets with derived spent/remaining + warnings.
 * POST /api/finance/budgets — create a budget (draft).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listBudgets, createBudget, budgetWarnings } from '@/lib/finance/budgets';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  const budgets = await listBudgets(session.schoolId);
  const warnings = await budgetWarnings(session.schoolId);
  return NextResponse.json({ success: true, budgets, warnings });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.budget_type) {
    return NextResponse.json({ error: 'name and budget_type are required' }, { status: 400 });
  }
  try {
    const id = await createBudget({
      schoolId: session.schoolId,
      name: String(body.name).trim(),
      budgetType: String(body.budget_type),
      termId: body.term_id ? Number(body.term_id) : null,
      scopeRefId: body.scope_ref_id ? Number(body.scope_ref_id) : null,
      plannedAmount: Number(body.planned_amount) || 0,
      approvedAmount: Number(body.approved_amount) || 0,
      warningThresholdPct: body.warning_threshold_pct ? Number(body.warning_threshold_pct) : 80,
      notes: body.notes ?? null,
      createdBy: session.userId,
    });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to create budget' }, { status: 500 });
  }
}
