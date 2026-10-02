/**
 * GET/POST /api/academics/offline/subjects — list/create subjects
 * (Phase 7 sub-effort 19). See ../route.ts's header for the design context.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDbMode } from '@/lib/db/db-mode';

function notOfflineResponse() {
  return NextResponse.json(
    { success: false, error: { message: 'This endpoint only serves local-sqlite mode.', code: 'NOT_OFFLINE_MODE' } },
    { status: 400 },
  );
}

export async function GET(request: NextRequest) {
  if (getDbMode() !== 'local-sqlite') return notOfflineResponse();
  const { handleListSubjects } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleListSubjects(request);
}

export async function POST(request: NextRequest) {
  if (getDbMode() !== 'local-sqlite') return notOfflineResponse();
  const { handleCreateSubject } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleCreateSubject(request);
}
