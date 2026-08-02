/**
 * GET /api/backup/[id]/download — redirect to the backup's Cloudinary
 * asset(s). A raw HTTP GET can only return one file: a single-part backup
 * redirects straight to it; a multi-part backup returns a small manifest
 * page listing every part's direct URL instead of silently only offering
 * part 1 — the UI links to this route and explains the multi-part case.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getBackup, getBackupParts } from '@/lib/backup/orchestrator';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const backupId = Number(id);
  const rec = await getBackup(backupId);
  if (!rec) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
  if (Number(rec.school_id) !== session.schoolId && !session.isSuperAdmin) {
    return NextResponse.json({ error: 'Not authorized for this backup' }, { status: 403 });
  }
  if (rec.status !== 'completed') {
    return NextResponse.json({ error: `Backup is not ready yet (status: ${rec.status})` }, { status: 409 });
  }

  const parts = await getBackupParts(backupId);
  if (!parts.length) return NextResponse.json({ error: 'No uploaded parts found' }, { status: 404 });

  void logAudit({
    schoolId: session.schoolId, userId: session.userId, action: AuditAction.BACKUP_DOWNLOADED,
    entityType: 'backup', entityId: backupId, details: { partCount: parts.length },
  });

  if (parts.length === 1) return NextResponse.redirect(parts[0].cloudinary_secure_url);

  const rows = parts.map((p) => `<li><a href="${p.cloudinary_secure_url}">Part ${p.part_number + 1} (${(p.bytes / 1024 / 1024).toFixed(1)} MB)</a></li>`).join('');
  const html = `<!doctype html><html><body>
    <h1>${rec.file_name || 'Backup'} — ${parts.length} parts</h1>
    <p>This backup was split into ${parts.length} files (each under Cloudinary's size limit). Download every part and concatenate them in order before restoring.</p>
    <ul>${rows}</ul>
  </body></html>`;
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
