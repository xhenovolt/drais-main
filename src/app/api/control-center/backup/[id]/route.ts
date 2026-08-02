import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, canManage, controlAudit, clientIp } from '@/lib/control/auth';
import { getBackup, getBackupParts, deleteBackup } from '@/lib/backup/orchestrator';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: 'Super admin role required' }, { status: 403 });
  const { id } = await ctx.params;
  const backupId = Number(id);
  const rec = await getBackup(backupId);
  if (!rec) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
  const parts = await getBackupParts(backupId);
  return NextResponse.json({ success: true, backup: rec, parts });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: 'Super admin role required' }, { status: 403 });
  const { id } = await ctx.params;
  const backupId = Number(id);
  const rec = await getBackup(backupId);
  if (!rec) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });

  await deleteBackup(backupId);
  await controlAudit(user.id, 'school_backup_deleted', `schools:${rec.school_id}`, { backupId }, clientIp(req));
  return NextResponse.json({ success: true });
}
