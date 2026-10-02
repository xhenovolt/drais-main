/**
 * GET/PUT/DELETE /api/staff/offline/[id] — see ../route.ts's header for
 * the design context (Phase 7 sub-effort 14).
 */
import { NextRequest, NextResponse } from 'next/server';
import { isLocalAllowed } from '@/lib/db/db-mode';

function notOfflineResponse() {
  return NextResponse.json(
    { success: false, error: { message: 'This endpoint is only available when this deployment allows local/offline mode.', code: 'NOT_OFFLINE_MODE' } },
    { status: 400 },
  );
}

function parseId(idParam: string): number | null {
  const id = Number(idParam);
  return Number.isFinite(id) ? id : null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isLocalAllowed()) return notOfflineResponse();
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleGet } = await import('@/lib/repo/offline-staff/route-bridge');
  return handleGet(request, id);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isLocalAllowed()) return notOfflineResponse();
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleUpdate } = await import('@/lib/repo/offline-staff/route-bridge');
  return handleUpdate(request, id);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isLocalAllowed()) return notOfflineResponse();
  const id = parseId((await params).id);
  if (id == null) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleDelete } = await import('@/lib/repo/offline-staff/route-bridge');
  return handleDelete(request, id);
}
