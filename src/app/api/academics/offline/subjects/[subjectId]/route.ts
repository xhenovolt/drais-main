/**
 * PUT/DELETE /api/academics/offline/subjects/[subjectId] — Phase 7
 * sub-effort 19. See ../../route.ts's header.
 */
import { NextRequest, NextResponse } from 'next/server';
import { isLocalAllowed } from '@/lib/db/db-mode';

function notOfflineResponse() {
  return NextResponse.json(
    { success: false, error: { message: 'This endpoint is only available when this deployment allows local/offline mode.', code: 'NOT_OFFLINE_MODE' } },
    { status: 400 },
  );
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) {
  if (!isLocalAllowed()) return notOfflineResponse();
  const subjectId = Number((await params).subjectId);
  if (!Number.isFinite(subjectId)) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleUpdateSubject } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleUpdateSubject(request, subjectId);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ subjectId: string }> }) {
  if (!isLocalAllowed()) return notOfflineResponse();
  const subjectId = Number((await params).subjectId);
  if (!Number.isFinite(subjectId)) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleDeleteSubject } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleDeleteSubject(request, subjectId);
}
