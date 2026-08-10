/**
 * GET  /api/finance/fee-rules/rules?fee_item_id= — eligibility rules.
 * POST /api/finance/fee-rules/rules — create a rule.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listRules, createRule } from '@/lib/finance/feeRules';
import { checkModule } from '@/lib/auth/requireModule';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  const feeItemId = Number(new URL(req.url).searchParams.get('fee_item_id')) || undefined;
  return NextResponse.json({ success: true, rules: await listRules(session.schoolId, feeItemId) });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }
  const b = await req.json().catch(() => null);
  if (!b?.fee_item_id) return NextResponse.json({ error: 'fee_item_id is required' }, { status: 400 });
  try {
    const id = await createRule(session.schoolId, b, session.userId);
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
