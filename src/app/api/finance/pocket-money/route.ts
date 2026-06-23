/**
 * GET  /api/finance/pocket-money — learner pocket-money accounts + balances.
 * POST /api/finance/pocket-money — record a deposit or withdrawal.
 *   Body: { student_id, type: 'deposit'|'withdrawal', amount, custodian?, reason?,
 *           depositor_name?, slip_no?, notes? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listAccounts, recordTransaction } from '@/lib/finance/pocketMoney';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  const accounts = await listAccounts(session.schoolId);
  const totalLiability = accounts.reduce((s, a) => s + a.balance, 0);
  const lowAlerts = accounts.filter((a) => a.low);
  return NextResponse.json({ success: true, accounts, totalLiability, lowAlerts });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  const studentId = Number(body?.student_id);
  const type = body?.type;
  const amount = Number(body?.amount);
  if (!studentId || !['deposit', 'withdrawal'].includes(type) || !amount) {
    return NextResponse.json({ error: 'student_id, type (deposit|withdrawal) and amount are required' }, { status: 400 });
  }
  try {
    const result = await recordTransaction({
      schoolId: session.schoolId,
      studentId,
      type,
      amount,
      custodian: body.custodian,
      reason: body.reason,
      depositorName: body.depositor_name,
      slipNo: body.slip_no,
      notes: body.notes,
      receivedBy: session.userId,
      createdBy: session.userId,
    });
    return NextResponse.json({ success: true, ...result }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 400 });
  }
}
