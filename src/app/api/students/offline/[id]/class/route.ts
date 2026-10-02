/**
 * PUT /api/students/offline/[id]/class — assign a student to a class
 * (ends any current enrollment first, then creates a new one).
 * DELETE /api/students/offline/[id]/class — unassign (end the current
 * enrollment, no replacement). Phase 7 sub-effort 19. See
 * ../../route.ts's header for the design context.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDbMode } from '@/lib/db/db-mode';

function notOfflineResponse() {
  return NextResponse.json(
    { success: false, error: { message: 'This endpoint only serves local-sqlite mode.', code: 'NOT_OFFLINE_MODE' } },
    { status: 400 },
  );
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (getDbMode() !== 'local-sqlite') return notOfflineResponse();
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleAssignClass } = await import('@/lib/repo/offline-students/route-bridge');
  return handleAssignClass(request, id);
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (getDbMode() !== 'local-sqlite') return notOfflineResponse();
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleUnassignClass } = await import('@/lib/repo/offline-students/route-bridge');
  return handleUnassignClass(request, id);
}
