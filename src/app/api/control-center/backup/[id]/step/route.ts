import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, canManage } from '@/lib/control/auth';
import { stepBackup, getBackup } from '@/lib/backup/orchestrator';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: 'Super admin role required' }, { status: 403 });

  const { id } = await ctx.params;
  const backupId = Number(id);
  const rec = await getBackup(backupId);
  if (!rec) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });

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
