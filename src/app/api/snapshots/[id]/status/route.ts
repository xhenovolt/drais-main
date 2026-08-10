import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getSnapshotRow } from '@/lib/snapshots/storage';
import { checkModule } from '@/lib/auth/requireModule';

/**
 * Lightweight polling endpoint — returns the index row only, no payload.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const row = await getSnapshotRow(id, session.schoolId);
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true, row });
}
