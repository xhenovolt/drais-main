/**
 * GET /api/academics/offline — list classes for the offline-academics
 * slice (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md Phase 7
 * sub-effort 17). Only meaningful in local-sqlite mode; refuses cleanly
 * otherwise.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDbMode } from '@/lib/db/db-mode';

export async function GET(request: NextRequest) {
  if (getDbMode() !== 'local-sqlite') {
    return NextResponse.json(
      { success: false, error: { message: 'This endpoint only serves local-sqlite mode.', code: 'NOT_OFFLINE_MODE' } },
      { status: 400 },
    );
  }
  const { handleList } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleList(request);
}
