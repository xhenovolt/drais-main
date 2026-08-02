/**
 * GET    /api/backup/[id] — one backup record + its uploaded parts.
 * DELETE /api/backup/[id] — delete the Cloudinary assets + the DB record.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getBackup, getBackupParts, deleteBackup } from '@/lib/backup/orchestrator';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

async function loadOwned(req: NextRequest, backupId: number, schoolId: number, isSuperAdmin: boolean) {
  const rec = await getBackup(backupId);
  if (!rec) return { error: NextResponse.json({ error: 'Backup not found' }, { status: 404 }) };
  if (Number(rec.school_id) !== schoolId && !isSuperAdmin) {
    return { error: NextResponse.json({ error: 'Not authorized for this backup' }, { status: 403 }) };
  }
  return { rec };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const backupId = Number(id);
  const { rec, error } = await loadOwned(req, backupId, session.schoolId, session.isSuperAdmin);
  if (error) return error;
  const parts = await getBackupParts(backupId);
  return NextResponse.json({ success: true, backup: rec, parts });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const backupId = Number(id);
  const { error } = await loadOwned(req, backupId, session.schoolId, session.isSuperAdmin);
  if (error) return error;

  await deleteBackup(backupId);
  void logAudit({
    schoolId: session.schoolId, userId: session.userId, action: AuditAction.BACKUP_DELETED,
    entityType: 'backup', entityId: backupId,
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
  });
  return NextResponse.json({ success: true });
}
