/**
 * POST /api/backup/[id]/step — generate one bounded unit of a backup
 * (one table's DDL + one row batch). Client loops calling this until
 * `allDone`, then calls .../finalize. Bounded per call so it never risks
 * a serverless timeout regardless of how large the school's data is.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { stepBackup, getBackup } from '@/lib/backup/orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const backupId = Number(id);
  if (!Number.isFinite(backupId)) return NextResponse.json({ error: 'Invalid backup id' }, { status: 400 });

  const rec = await getBackup(backupId);
  if (!rec) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
  if (Number(rec.school_id) !== session.schoolId && !session.isSuperAdmin) {
    return NextResponse.json({ error: 'Not authorized for this backup' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const tableIndex = Number(body?.tableIndex);
  const offset = Number(body?.offset ?? 0);
  const knownEmpty = Boolean(body?.knownEmpty);
  if (!Number.isFinite(tableIndex) || !Number.isFinite(offset)) {
    return NextResponse.json({ error: 'tableIndex and offset are required' }, { status: 400 });
  }

  try {
    const result = await stepBackup(backupId, Number(rec.school_id), tableIndex, offset, knownEmpty);
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Step failed' }, { status: 500 });
  }
}
