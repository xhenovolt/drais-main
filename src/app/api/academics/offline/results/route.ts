/**
 * GET/PUT /api/academics/offline/results — list a class/subject's marks
 * (?classId&?subjectId) / upsert one mark (Phase 7 sub-effort 19). See
 * ../route.ts's header.
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
  const { handleListResults } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleListResults(request);
}

export async function PUT(request: NextRequest) {
  if (!isLocalAllowed()) return notOfflineResponse();
  const { handleUpsertResult } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleUpsertResult(request);
}
