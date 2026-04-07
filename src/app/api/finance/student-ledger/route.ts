import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getStudentLedger, getStudentBalance } from '@/lib/services/FinanceLedger';

// GET /api/finance/student-ledger?student_id=N[&limit=50]
// Returns: { ledger: LedgerEntry[], balance: StudentBalance }

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

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
