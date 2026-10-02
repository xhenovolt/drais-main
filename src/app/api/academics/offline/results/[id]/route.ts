/**
 * DELETE /api/academics/offline/results/[id] — remove a mark (Phase 7
 * sub-effort 19). See ../../route.ts's header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isLocalAllowed } from '@/lib/db/db-mode';

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isLocalAllowed()) {
    return NextResponse.json(
      { success: false, error: { message: 'This endpoint is only available when this deployment allows local/offline mode.', code: 'NOT_OFFLINE_MODE' } },
      { status: 400 },
    );
  }
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleDeleteResult } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleDeleteResult(request, id);
}
