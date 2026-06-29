/**
 * PATCH  /api/report-comments/[id] — edit a comment rule.
 * DELETE /api/report-comments/[id] — remove a comment rule.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { updateCommentRule, deleteCommentRule } from '@/lib/drce/reportComments.server';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  await updateCommentRule(session.schoolId, Number(id), await req.json().catch(() => ({})));
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  await deleteCommentRule(session.schoolId, Number(id));
  return NextResponse.json({ success: true });
}
