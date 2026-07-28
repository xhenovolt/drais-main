/**
 * PATCH  /api/report-comments/overall/[id] — edit an overall comment rule.
 * DELETE /api/report-comments/overall/[id] — remove an overall comment rule.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import { updateOverallCommentRule, deleteOverallCommentRule } from '@/lib/drce/overallComments.server';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  await updateOverallCommentRule(session.schoolId, Number(id), body);
  void logAudit({
    schoolId: session.schoolId, userId: session.userId, action: AuditAction.COMMENT_RULE_CHANGED,
    entityType: 'report_overall_comment_rule', entityId: Number(id),
    details: { op: 'update', fields: Object.keys(body) },
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  await deleteOverallCommentRule(session.schoolId, Number(id));
  void logAudit({
    schoolId: session.schoolId, userId: session.userId, action: AuditAction.COMMENT_RULE_CHANGED,
    entityType: 'report_overall_comment_rule', entityId: Number(id),
    details: { op: 'delete' },
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
    userAgent: req.headers.get('user-agent'),
  });
  return NextResponse.json({ success: true });
}
