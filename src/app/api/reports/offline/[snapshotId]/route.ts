/**
 * GET /api/reports/offline/[snapshotId] — see ../route.ts's header for
 * the design context (Phase 7 sub-effort 20).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isLocalAllowed } from '@/lib/db/db-mode';

export async function GET(request: NextRequest, { params }: { params: Promise<{ snapshotId: string }> }) {
  if (!isLocalAllowed()) {
    return NextResponse.json(
      { success: false, error: { message: 'This endpoint is only available when this deployment allows local/offline mode.', code: 'NOT_OFFLINE_MODE' } },
      { status: 400 },
    );
  }
  const { snapshotId } = await params;
  const { handleGet } = await import('@/lib/repo/offline-reports/route-bridge');
  return handleGet(request, snapshotId);
}
