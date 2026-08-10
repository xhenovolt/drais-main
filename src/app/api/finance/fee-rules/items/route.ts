/**
 * GET  /api/finance/fee-rules/items — reusable school fee items.
 * POST /api/finance/fee-rules/items — create a fee item.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listFeeItems, createFeeItem } from '@/lib/finance/feeRules';
import { checkModule } from '@/lib/auth/requireModule';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  return NextResponse.json({ success: true, items: await listFeeItems(session.schoolId) });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const b = await req.json().catch(() => null);
  if (!b?.name?.trim()) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  try {
    const id = await createFeeItem(session.schoolId, b, session.userId);
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
