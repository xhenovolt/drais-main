/**
 * POST /api/finance/fee-rules/preview — "preview affected learners" for a rule's
 * conditions (before saving). Body = the rule condition fields.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { previewRuleLearners } from '@/lib/finance/feeRules';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  const rule = await req.json().catch(() => ({}));
  try {
    const { count, learners } = await previewRuleLearners(session.schoolId, rule);
    return NextResponse.json({ success: true, count, learners });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Preview failed' }, { status: 500 });
  }
}
