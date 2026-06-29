/**
 * GET  /api/report-comments — list this school's comment rules.
 * POST /api/report-comments — create a rule.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { listCommentRules, createCommentRule } from '@/lib/drce/reportComments.server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ success: true, rules: await listCommentRules(session.schoolId) });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b = await req.json().catch(() => null);
  if (!b?.comment_text?.trim()) return NextResponse.json({ error: 'comment_text is required' }, { status: 400 });
  try {
    const id = await createCommentRule(session.schoolId, b, session.userId);
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
