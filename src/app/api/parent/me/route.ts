/**
 * GET /api/parent/me
 * The authenticated parent + their linked learners across all schools.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireParent } from '@/lib/parent/context';
import { resolveLearnersForParent } from '@/lib/parent/parent-access-resolver';

export async function GET(req: NextRequest) {
  const res = await requireParent(req);
  if ('error' in res) return res.error;
  const { session } = res;

  const learners = await resolveLearnersForParent(session.parentAccountId);
  return NextResponse.json({
    success: true,
    parent: { id: session.parentAccountId, phone: session.phone, fullName: session.fullName },
    learner_count: learners.length,
    schools: [...new Set(learners.map(l => l.school_name))],
    learners: learners.map(({ student_id: _s, parent_identity_id: _p, ...safe }) => { void _s; void _p; return safe; }),
  });
}
