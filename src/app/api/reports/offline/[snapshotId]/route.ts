/**
 * GET /api/reports/offline/[snapshotId] — see ../route.ts's header for
 * the design context (Phase 7 sub-effort 20).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDbMode } from '@/lib/db/db-mode';

export async function GET(request: NextRequest, { params }: { params: Promise<{ snapshotId: string }> }) {
  if (getDbMode() !== 'local-sqlite') {
    return NextResponse.json(
      { success: false, error: { message: 'This endpoint only serves local-sqlite mode.', code: 'NOT_OFFLINE_MODE' } },
      { status: 400 },
    );
  }
  const { snapshotId } = await params;
  const { handleGet } = await import('@/lib/repo/offline-reports/route-bridge');
  return handleGet(request, snapshotId);
}
