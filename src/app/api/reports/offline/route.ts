/**
 * GET /api/reports/offline — list ready report snapshots for the
 * offline-reports slice (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md
 * Phase 7 sub-effort 20). Only meaningful in local-sqlite mode; refuses
 * cleanly otherwise.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isLocalAllowed } from '@/lib/db/db-mode';

export async function GET(request: NextRequest) {
  if (!isLocalAllowed()) {
    return NextResponse.json(
      { success: false, error: { message: 'This endpoint is only available when this deployment allows local/offline mode.', code: 'NOT_OFFLINE_MODE' } },
      { status: 400 },
    );
  }
  const { handleList } = await import('@/lib/repo/offline-reports/route-bridge');
  return handleList(request);
}
