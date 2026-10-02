/**
 * GET/POST /api/academics/offline — list/create classes for the
 * offline-academics slice (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md
 * Phase 7 sub-effort 17, writes added sub-effort 19). Only meaningful in
 * local-sqlite mode; refuses cleanly otherwise.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isLocalAllowed } from '@/lib/db/db-mode';

function notOfflineResponse() {
  return NextResponse.json(
    { success: false, error: { message: 'This endpoint is only available when this deployment allows local/offline mode.', code: 'NOT_OFFLINE_MODE' } },
    { status: 400 },
  );
}

export async function GET(request: NextRequest) {
  if (!isLocalAllowed()) return notOfflineResponse();
  const { handleList } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleList(request);
}

export async function POST(request: NextRequest) {
  if (!isLocalAllowed()) return notOfflineResponse();
  const { handleCreateClass } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleCreateClass(request);
}
