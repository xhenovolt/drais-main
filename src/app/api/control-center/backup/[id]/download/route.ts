import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, canManage, controlAudit, clientIp } from '@/lib/control/auth';
import { getBackup, getBackupParts } from '@/lib/backup/orchestrator';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: 'Super admin role required' }, { status: 403 });
  const { id } = await ctx.params;
  const backupId = Number(id);
  const rec = await getBackup(backupId);
  if (!rec) return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
  if (rec.status !== 'completed') return NextResponse.json({ error: `Backup is not ready yet (status: ${rec.status})` }, { status: 409 });

  const parts = await getBackupParts(backupId);
  if (!parts.length) return NextResponse.json({ error: 'No uploaded parts found' }, { status: 404 });

  await controlAudit(user.id, 'school_backup_downloaded', `schools:${rec.school_id}`, { backupId, partCount: parts.length }, clientIp(req));

  if (parts.length === 1) return NextResponse.redirect(parts[0].cloudinary_secure_url);
  const rows = parts.map((p) => `<li><a href="${p.cloudinary_secure_url}">Part ${p.part_number + 1} (${(p.bytes / 1024 / 1024).toFixed(1)} MB)</a></li>`).join('');
  const html = `<!doctype html><html><body>
    <h1>${rec.file_name || 'Backup'} — ${parts.length} parts</h1>
    <p>Split into ${parts.length} files. Download every part and concatenate them in order before restoring.</p>
    <ul>${rows}</ul>
  </body></html>`;
  return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
