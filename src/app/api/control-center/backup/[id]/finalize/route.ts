import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, canManage, controlAudit, clientIp } from '@/lib/control/auth';
import { finalizeStep, getBackup } from '@/lib/backup/orchestrator';

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

  const result = await finalizeStep(backupId, rec.backup_uuid);
  if (result.stage === 'completed' || result.stage === 'failed') {
    await controlAudit(user.id, result.stage === 'completed' ? 'school_backup_completed' : 'school_backup_failed',
      `schools:${rec.school_id}`, { backupId, error: result.error }, clientIp(req));
  }
  return NextResponse.json({ success: result.stage !== 'failed', ...result });
}
