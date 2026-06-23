/**
 * POST /api/finance/fee-rules/evaluate — preview a learner's applicable fees
 * for a term, with an explanation per line. No write.
 * Body: { student_id, term_id? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { evaluateLearnerFees } from '@/lib/finance/feeRules';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  const b = await req.json().catch(() => ({}));
  const studentId = Number(b?.student_id);
  if (!studentId) return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  const result = await evaluateLearnerFees(session.schoolId, studentId, b?.term_id ? Number(b.term_id) : null);
  return NextResponse.json({ success: true, ...result });
}
