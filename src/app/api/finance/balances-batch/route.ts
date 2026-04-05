import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getBalancesForStudents } from '@/lib/services/FinanceLedger';

/**
 * POST /api/finance/balances-batch
 * Body: { student_ids: number[] }
 * Returns: { balances: Record<string, StudentBalance> }
 *
 * Fetches calculated balances for multiple students in a single query.
 * Used by the student list page "Show Fees" column toggle.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: { student_ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { student_ids } = body;
  if (!Array.isArray(student_ids) || student_ids.length === 0) {
    return NextResponse.json({ error: 'student_ids must be a non-empty array' }, { status: 400 });
  }

  // Validate all IDs are positive integers
  const ids = student_ids
    .map((id) => (typeof id === 'number' ? Math.floor(id) : parseInt(String(id, 10), 10)))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (ids.length === 0) {
    return NextResponse.json({ error: 'No valid student IDs provided' }, { status: 400 });
  }

  // Cap at 500 to prevent accidental overload
  const capped = ids.slice(0, 500);

  const balanceMap = await getBalancesForStudents(capped, session.schoolId);

  // Convert Map → plain object for JSON serialisation
  const balances: Record<string, unknown> = {};
  for (const [id, bal] of balanceMap.entries()) {
    balances[String(id)] = bal;
  }

  return NextResponse.json({ balances, count: balanceMap.size });
}
