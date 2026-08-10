import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import { checkCapacity } from '@/lib/entitlements/limits';

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

    // Plan capacity. Restoring returns a learner to the live roll, so it
    // consumes capacity exactly as an admission does — otherwise Trash becomes
    // an overflow store that lets a school sit permanently over its plan.
    //
    // Charge only the rows that will ACTUALLY be restored: ids that are truly
    // soft-deleted and belong to this school. Restoring an already-live learner
    // is a no-op and must not consume anything, or a repeated click would eat
    // the school's headroom.
    const [pending]: any = await conn.execute(
      `SELECT COUNT(*) AS n FROM students
        WHERE school_id = ? AND deleted_at IS NOT NULL AND id IN (${placeholders})`,
      [schoolId, ...ids],
    );
    const willRestore = Number(pending?.[0]?.n ?? 0);
    if (willRestore > 0) {
      const overCapacity = await checkCapacity(schoolId, 'learners', willRestore);
      if (overCapacity) { await conn.end(); return overCapacity; }
    }

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
