/**
 * POST /api/control-center/backup/start — begin a backup for ANY single
 * school, operator-chosen. Super-admin only. Same orchestrator as the
 * school-scoped route — only auth + how schoolId is resolved differs.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, canManage, controlAudit, clientIp } from '@/lib/control/auth';
import { startBackup } from '@/lib/backup/orchestrator';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!canManage(user.role)) return NextResponse.json({ error: 'Super admin role required' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const schoolId = Number(body?.schoolId);
  if (!Number.isFinite(schoolId)) return NextResponse.json({ error: 'schoolId is required' }, { status: 400 });

  try {
    const result = await startBackup(schoolId, null, user.name, 'control');
    await controlAudit(user.id, 'school_backup_started', `schools:${schoolId}`,
      { backupId: result.backupId, tableCount: result.tables.length, estimatedRowCount: result.estimatedRowCount, sizeWarning: result.sizeWarning },
      clientIp(req));
    void logAudit({
      schoolId, userId: null, action: AuditAction.BACKUP_CREATED_SCHOOL,
      entityType: 'backup', entityId: result.backupId,
      details: { backupUuid: result.backupUuid, initiatedByControlUser: user.name },
      source: 'WEB',
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to start backup' }, { status: 500 });
  }
}
