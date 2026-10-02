/**
 * PUT /api/attendance/offline/status — manually override a day's
 * attendance status (Phase 7 sub-effort 19). See ../route.ts's header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isLocalAllowed } from '@/lib/db/db-mode';

export async function PUT(request: NextRequest) {
  if (!isLocalAllowed()) {
    return NextResponse.json(
      { success: false, error: { message: 'This endpoint is only available when this deployment allows local/offline mode.', code: 'NOT_OFFLINE_MODE' } },
      { status: 400 },
    );
  }
  const { handleOverrideStatus } = await import('@/lib/repo/offline-attendance/route-bridge');
  return handleOverrideStatus(request);
}
