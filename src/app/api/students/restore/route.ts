import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

/**
 * POST /api/students/restore — bring soft-deleted learner(s) back from Trash.
 *
 * Body: { ids: number[] }  (or { id: number } for a single row)
 * Only rows that ARE soft-deleted AND belong to this school are restored
 * (tenant-scoped, idempotent). Stamps restored_at / restored_by for audit.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId, userId } = session;

  let ids: number[] = [];
  try {
    const body = await req.json();
    if (Array.isArray(body?.ids)) {
      ids = body.ids.map((x: any) => parseInt(String(x), 10)).filter((n: number) => Number.isFinite(n) && n > 0);
    } else if (body?.id) {
      const n = parseInt(String(body.id), 10);
      if (n > 0) ids = [n];
    }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (ids.length === 0) return NextResponse.json({ error: 'No valid student IDs' }, { status: 400 });

  const conn = await getConnection();
  try {
    const placeholders = ids.map(() => '?').join(',');
    const [res]: any = await conn.execute(
      `UPDATE students
          SET deleted_at = NULL, restored_at = NOW(), restored_by = ?
        WHERE school_id = ? AND deleted_at IS NOT NULL AND id IN (${placeholders})`,
      [userId ?? null, schoolId, ...ids],
    );
    void logAudit({
      schoolId, userId: userId ?? null, action: AuditAction.RESTORED_STUDENT,
      entityType: 'student', entityId: ids.length === 1 ? ids[0] : null,
      details: { ids, restored: res.affectedRows ?? 0 },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json({ success: true, restored: res.affectedRows ?? 0 });
  } catch (error: any) {
    console.error('Restore error:', error);
    return NextResponse.json({ error: 'Failed to restore student(s)', detail: error.message }, { status: 500 });
  } finally {
    await conn.end();
  }
}
