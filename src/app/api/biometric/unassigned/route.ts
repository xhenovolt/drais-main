/**
 * GET /api/biometric/unassigned
 *
 * Returns fingerprint enrollments that have no identity assigned yet.
 * Status = UNASSIGNED or CAPTURED-without-student_id.
 *
 * Query params:
 *   limit  — max rows (default 50, max 200)
 *   offset — for pagination
 *
 * Returns: { enrollments: [...], total: number }
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);
  const schoolId = session.schoolId;

  try {
    // expired sessions should be marked; auto-expire here too (best-effort)
    await query(
      `UPDATE enrollment_sessions SET status='EXPIRED'
       WHERE status='ACTIVE' AND expires_at < NOW() AND school_id = ?`,
      [schoolId],
    ).catch(() => {});

    const rows = await query(
      `SELECT
         be.id,
         be.device_sn,
         be.device_slot,
         be.status,
         be.source,
         be.finger_index,
         be.initiated_at,
         be.captured_at,
         be.updated_at,
         es.initiated_by,
         CONCAT(u.first_name, ' ', u.last_name) AS initiated_by_name
       FROM biometric_enrollments be
       LEFT JOIN enrollment_sessions es ON be.session_id = es.id
       LEFT JOIN users u ON es.initiated_by = u.id
       WHERE be.school_id = ?
         AND be.status IN ('UNASSIGNED', 'CAPTURED')
         AND be.student_id IS NULL
       ORDER BY be.initiated_at DESC
       LIMIT ? OFFSET ?`,
      [schoolId, limit, offset],
    );

    const countRows = await query(
      `SELECT COUNT(*) AS cnt
       FROM biometric_enrollments
       WHERE school_id = ? AND status IN ('UNASSIGNED','CAPTURED') AND student_id IS NULL`,
      [schoolId],
    );
    const total = Number(countRows?.[0]?.cnt ?? 0);

    return NextResponse.json({ enrollments: rows ?? [], total });
  } catch (e: any) {
    return NextResponse.json({ error: `DB error: ${e.message}` }, { status: 500 });
  }
}
