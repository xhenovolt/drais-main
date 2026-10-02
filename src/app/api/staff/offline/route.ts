/**
 * GET/POST /api/staff/offline — list/create staff for the offline-staff
 * slice (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md Phase 7
 * sub-effort 14). Same shape as /api/students/offline — a genuinely new
 * route, not a mode-branch on any existing staff route. Only meaningful in
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
  const { handleList } = await import('@/lib/repo/offline-staff/route-bridge');
  return handleList(request);
}

export async function POST(request: NextRequest) {
  if (!isLocalAllowed()) return notOfflineResponse();
  const { handleCreate } = await import('@/lib/repo/offline-staff/route-bridge');
  return handleCreate(request);
}
