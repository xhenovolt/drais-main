/**
 * POST /api/finance/locations/transfer — move money between two locations.
 * Body: { from_wallet_id, to_wallet_id, amount, transfer_type?, reference?, notes? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { createTransfer } from '@/lib/finance/locations';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  const from = Number(body?.from_wallet_id);
  const to = Number(body?.to_wallet_id);
  const amount = Number(body?.amount);
  if (!from || !to || !amount) {
    return NextResponse.json({ error: 'from_wallet_id, to_wallet_id and amount are required' }, { status: 400 });
  }
  try {
    const id = await createTransfer({
      schoolId: session.schoolId,
      fromWalletId: from,
      toWalletId: to,
      amount,
      transferType: body.transfer_type,
      reference: body.reference,
      notes: body.notes,
      createdBy: session.userId,
    });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Transfer failed' }, { status: 400 });
  }
}
