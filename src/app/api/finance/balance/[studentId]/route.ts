import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getStudentBalance } from '@/lib/services/FinanceLedger';
import { checkModule } from '@/lib/auth/requireModule';

// GET /api/finance/balance/[studentId]
// Returns the calculated balance for a single student

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ studentId: string }> }
) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;

  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  const { studentId } = await params;
  const id = parseInt(studentId, 10);
  if (!id) return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });

  const balance = await getStudentBalance(id, session.schoolId);
  return NextResponse.json(balance);
}
