import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { forceCancel } from '@/lib/snapshots/lifecycle';

/**
 * Force-cancel an in-flight snapshot generation. Any authenticated school
 * member may call this — it only operates on rows where status='generating'
 * and cannot affect terminal-state history.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;
  let body: any = {};
  try { body = await req.json(); } catch { /* empty body is fine */ }
  const reason = typeof body?.reason === 'string' ? body.reason : 'manual cancel';

  const ok = await forceCancel({
    snapshotId:  id,
    schoolId:    session.schoolId,
    reason,
    cancelledBy: session.userId,
  });
  if (!ok) {
    return NextResponse.json(
      { error: 'Snapshot is not in `generating` state or does not belong to this school' },
      { status: 404 },
    );
  }
  return NextResponse.json({ success: true });
}
