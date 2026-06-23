/**
 * GET /api/finance/pocket-money/[studentId] — a learner's pocket-money statement.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getStatement } from '@/lib/finance/pocketMoney';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ studentId: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  const { studentId } = await ctx.params;
  const transactions = await getStatement(session.schoolId, Number(studentId));
  return NextResponse.json({ success: true, transactions });
}
