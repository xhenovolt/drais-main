/**
 * POST /api/attendance/offline/punch — record a punch offline (Phase 7
 * sub-effort 19). Only meaningful in local-sqlite mode; refuses cleanly
 * otherwise.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isLocalAllowed } from '@/lib/db/db-mode';

export async function POST(request: NextRequest) {
  if (!isLocalAllowed()) {
    return NextResponse.json(
      { success: false, error: { message: 'This endpoint is only available when this deployment allows local/offline mode.', code: 'NOT_OFFLINE_MODE' } },
      { status: 400 },
    );
  }
  const { handleRecordPunch } = await import('@/lib/repo/offline-attendance/route-bridge');
  return handleRecordPunch(request);
}
