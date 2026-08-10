import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import {
  deleteOverride,
  verifySnapshotOwnership,
} from '@/lib/snapshots/overrides';
import { checkModule } from '@/lib/auth/requireModule';

/**
 * DELETE /api/snapshots/[id]/overrides/[overrideId]
 * Remove a single override row. School scoping enforced via the
 * snapshot owner check plus a defensive join in the storage layer.
 */
export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; overrideId: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'academics');
  if (modDenied) return modDenied;

  const { id: snapshotId, overrideId: overrideIdRaw } = await ctx.params;
  const overrideId = Number(overrideIdRaw);
  if (!Number.isFinite(overrideId) || overrideId <= 0) {
    return NextResponse.json({ error: 'Invalid overrideId' }, { status: 400 });
  }

  if (!await verifySnapshotOwnership(snapshotId, session.schoolId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const ok = await deleteOverride({
    overrideId,
    snapshotId,
    schoolId: session.schoolId,
  });
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
