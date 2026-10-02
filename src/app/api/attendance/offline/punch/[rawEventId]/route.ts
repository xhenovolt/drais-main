/**
 * DELETE /api/attendance/offline/punch/[rawEventId] — undo a manually
 * recorded punch (Phase 7 sub-effort 19). See ../route.ts's header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isLocalAllowed } from '@/lib/db/db-mode';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ rawEventId: string }> }) {
  if (!isLocalAllowed()) {
    return NextResponse.json(
      { success: false, error: { message: 'This endpoint is only available when this deployment allows local/offline mode.', code: 'NOT_OFFLINE_MODE' } },
      { status: 400 },
    );
  }
  const rawEventId = Number((await params).rawEventId);
  if (!Number.isFinite(rawEventId)) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleDeleteManualPunch } = await import('@/lib/repo/offline-attendance/route-bridge');
  return handleDeleteManualPunch(request, rawEventId);
}
