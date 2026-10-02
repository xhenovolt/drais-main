/**
 * DELETE /api/academics/offline/allocations/[id] — end a teacher
 * allocation (Phase 7 sub-effort 19). See ../../route.ts's header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDbMode } from '@/lib/db/db-mode';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (getDbMode() !== 'local-sqlite') {
    return NextResponse.json(
      { success: false, error: { message: 'This endpoint only serves local-sqlite mode.', code: 'NOT_OFFLINE_MODE' } },
      { status: 400 },
    );
  }
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleEndAllocation } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleEndAllocation(request, id);
}
