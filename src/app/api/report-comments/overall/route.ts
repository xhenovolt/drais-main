/**
 * GET  /api/report-comments/overall — list this school's overall (Class
 *      Teacher / DOS / Headteacher / custom) intelligent comment rules.
 * POST /api/report-comments/overall — create a rule.
 *
 * Distinct from /api/report-comments (per-SUBJECT remark rules, Phase 4).
 * These rules drive the whole-report Class Teacher / DOS / Headteacher
 * comments — Report Engine Patch Program Phase II.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import {
  listOverallCommentRules, createOverallCommentRule,
} from '@/lib/drce/overallComments.server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ success: true, rules: await listOverallCommentRules(session.schoolId) });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const id = await createOverallCommentRule(session.schoolId, b, session.userId);
    void logAudit({
      schoolId: session.schoolId, userId: session.userId, action: AuditAction.COMMENT_RULE_CHANGED,
      entityType: 'report_overall_comment_rule', entityId: id,
      details: { op: 'create', role: b.role, mode: b.mode ?? 'replace' },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 400 });
  }
}
