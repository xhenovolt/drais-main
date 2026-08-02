/**
 * POST /api/backup/start — begin a school backup (school-scoped).
 * Always uses the session's OWN school_id — never a client-supplied one.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { startBackup } from '@/lib/backup/orchestrator';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'backup.manage', session.isSuperAdmin);
  } catch {
    if (!session.isSuperAdmin) {
      try { await requirePermission(session.userId, session.schoolId, 'attendance.manage', session.isSuperAdmin); }
      catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
    }
  }

  try {
    const result = await startBackup(session.schoolId, session.userId, null, 'school');
    void logAudit({
      schoolId: session.schoolId, userId: session.userId, action: AuditAction.BACKUP_CREATED_SCHOOL,
      entityType: 'backup', entityId: result.backupId,
      details: { backupUuid: result.backupUuid, tableCount: result.tables.length, estimatedRowCount: result.estimatedRowCount, sizeWarning: result.sizeWarning },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to start backup' }, { status: 500 });
  }
}
