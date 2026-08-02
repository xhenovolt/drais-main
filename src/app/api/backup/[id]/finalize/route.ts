/**
 * POST /api/backup/[id]/finalize — one bounded unit of assemble/upload/verify.
 * Client calls repeatedly (same shape as .../step) until `stage` is
 * 'completed' or 'failed' — never one long call, same Hobby-timeout
 * reasoning as generation.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { finalizeStep, getBackup } from '@/lib/backup/orchestrator';
import { logAudit, AuditAction } from '@/lib/audit';

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

  const result = await finalizeStep(backupId, rec.backup_uuid);
  if (result.stage === 'failed') {
    void logAudit({
      schoolId: session.schoolId, userId: session.userId, action: AuditAction.BACKUP_FAILED,
      entityType: 'backup', entityId: backupId, details: { error: result.error },
    });
  }
  return NextResponse.json({ success: result.stage !== 'failed', ...result });
}
