import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { loadSnapshot, deleteSnapshot, getSnapshotRow } from '@/lib/snapshots/storage';

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id } = await ctx.params;
  const snapshot = await loadSnapshot(id, session.schoolId);
  if (!snapshot) {
    // 404 (not 403) — do not leak existence across schools.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const row = await getSnapshotRow(id, session.schoolId);
  return NextResponse.json({ success: true, snapshot, row });
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!session.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const ok = await deleteSnapshot(id, session.schoolId);
  if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
