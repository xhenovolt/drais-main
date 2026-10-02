/**
 * GET/PUT/DELETE /api/academics/offline/[classId] — see ../route.ts's
 * header for the design context (Phase 7 sub-effort 17, writes added
 * sub-effort 19).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isLocalAllowed } from '@/lib/db/db-mode';

function notOfflineResponse() {
  return NextResponse.json(
    { success: false, error: { message: 'This endpoint is only available when this deployment allows local/offline mode.', code: 'NOT_OFFLINE_MODE' } },
    { status: 400 },
  );
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  if (!isLocalAllowed()) return notOfflineResponse();
  const classId = Number((await params).classId);
  if (!Number.isFinite(classId)) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleGet } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleGet(request, classId);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  if (!isLocalAllowed()) return notOfflineResponse();
  const classId = Number((await params).classId);
  if (!Number.isFinite(classId)) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleUpdateClass } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleUpdateClass(request, classId);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  if (!isLocalAllowed()) return notOfflineResponse();
  const classId = Number((await params).classId);
  if (!Number.isFinite(classId)) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleDeleteClass } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleDeleteClass(request, classId);
}
