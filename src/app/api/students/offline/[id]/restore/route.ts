/**
 * POST /api/students/offline/[id]/restore — see ../../route.ts's header
 * for the design context (Phase 7 sub-effort 11).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getDbMode } from '@/lib/db/db-mode';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (getDbMode() !== 'local-sqlite') {
    return NextResponse.json(
      { success: false, error: { message: 'This endpoint only serves local-sqlite mode.', code: 'NOT_OFFLINE_MODE' } },
      { status: 400 },
    );
  }
  const id = Number((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ success: false, error: { message: 'Invalid id' } }, { status: 400 });
  const { handleRestore } = await import('@/lib/repo/offline-students/route-bridge');
  return handleRestore(request, id);
}
