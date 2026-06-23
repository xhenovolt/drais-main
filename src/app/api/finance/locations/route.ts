/**
 * GET  /api/finance/locations — money locations with derived balances.
 * POST /api/finance/locations — create a money location.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listLocations, createLocation } from '@/lib/finance/locations';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  const locations = await listLocations(session.schoolId);
  const totalsByType: Record<string, number> = {};
  let total = 0;
  for (const l of locations) { totalsByType[l.location_type] = (totalsByType[l.location_type] || 0) + l.balance; total += l.balance; }
  return NextResponse.json({ success: true, locations, totalsByType, total });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  if (!body?.name || !body?.location_type) {
    return NextResponse.json({ error: 'name and location_type are required' }, { status: 400 });
  }
  try {
    const id = await createLocation({
      schoolId: session.schoolId,
      name: String(body.name).trim(),
      locationType: String(body.location_type),
      currency: body.currency,
      provider: body.provider ?? null,
      accountNumber: body.account_number ?? null,
      bankName: body.bank_name ?? null,
      branchName: body.branch_name ?? null,
      openingBalance: Number(body.opening_balance) || 0,
    });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to create location' }, { status: 500 });
  }
}
