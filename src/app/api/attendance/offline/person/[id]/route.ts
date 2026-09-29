/**
 * GET /api/attendance/offline/person/[id]?from=YYYY-MM-DD&to=YYYY-MM-DD —
 * see ../../route.ts's header for the design context (Phase 7 sub-effort 12).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDbMode } from '@/lib/db/db-mode';

function notOfflineResponse() {
  return NextResponse.json(
    { success: false, error: { message: 'This endpoint only serves local-sqlite mode.', code: 'NOT_OFFLINE_MODE' } },
    { status: 400 },
  );
}

function parseId(idParam: string): number | null {
  const id = Number(idParam);
  return Number.isFinite(id) ? id : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (getDbMode() !== 'local-sqlite') return notOfflineResponse();
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleForPerson } = await import('@/lib/repo/offline-attendance/route-bridge');
  return handleForPerson(request, id);
}
