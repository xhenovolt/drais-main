import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getStudentLedger, getStudentBalance } from '@/lib/services/FinanceLedger';
import { checkModule } from '@/lib/auth/requireModule';

// GET /api/finance/student-ledger?student_id=N[&limit=50]
// Returns: { ledger: LedgerEntry[], balance: StudentBalance }

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;

  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  const { searchParams } = new URL(req.url);
  const studentId = parseInt(searchParams.get('student_id') ?? '0', 10);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '200', 10), 500);

  if (!studentId) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const [ledger, balance] = await Promise.all([
    getStudentLedger(studentId, session.schoolId, limit),
    getStudentBalance(studentId, session.schoolId),
  ]);

  return NextResponse.json({ ledger, balance });
}
