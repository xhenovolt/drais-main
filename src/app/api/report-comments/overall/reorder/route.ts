/**
 * POST /api/report-comments/overall/reorder — bulk priority reorder.
 * Body: { order: Array<{ id: number; priority: number }> }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import { reorderOverallCommentRules } from '@/lib/drce/overallComments.server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(() => null);
  const order = Array.isArray(body?.order) ? body.order : null;
  if (!order) return NextResponse.json({ error: '"order" array is required' }, { status: 400 });
  await reorderOverallCommentRules(session.schoolId, order);
  void logAudit({
    schoolId: session.schoolId, userId: session.userId, action: AuditAction.COMMENT_RULE_CHANGED,
    entityType: 'report_overall_comment_rule',
    details: { op: 'reorder', count: order.length },
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ success: true });
}
