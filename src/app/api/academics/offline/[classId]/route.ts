/**
 * GET /api/academics/offline/[classId] — see ../route.ts's header for
 * the design context (Phase 7 sub-effort 17).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDbMode } from '@/lib/db/db-mode';

export async function GET(request: NextRequest, { params }: { params: Promise<{ classId: string }> }) {
  if (getDbMode() !== 'local-sqlite') {
    return NextResponse.json(
      { success: false, error: { message: 'This endpoint only serves local-sqlite mode.', code: 'NOT_OFFLINE_MODE' } },
      { status: 400 },
    );
  }
  const classId = Number((await params).classId);
  if (!Number.isFinite(classId)) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleGet } = await import('@/lib/repo/offline-academics/route-bridge');
  return handleGet(request, classId);
}
