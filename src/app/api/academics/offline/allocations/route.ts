/**
 * POST /api/academics/offline/allocations — assign a teacher to a
 * subject in a class (Phase 7 sub-effort 19). See ../route.ts's header.
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
  const { handleAssignTeacher } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleAssignTeacher(request);
}
