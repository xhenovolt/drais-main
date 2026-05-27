/**
 * GET /api/admin/parent-links?status=pending
 *
 * Staff-side approval queue. Lists parent→learner link requests for the
 * staff member's own school only. Gated by students.manage.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'students.manage', session.isSuperAdmin);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const status = new URL(req.url).searchParams.get('status') ?? 'pending';
  const allowed = ['pending', 'active', 'revoked'];
  const statusFilter = allowed.includes(status) ? status : 'pending';

  const rows = (await query(
    `SELECT psl.id, psl.student_id,
            TRIM(CONCAT_WS(' ', lp.first_name, lp.last_name)) AS learner_name,
            psl.parent_account_id, pa.phone AS parent_phone, pa.full_name AS parent_name,
            psl.relationship, psl.status, psl.verified_via, psl.requested_at, psl.approved_at
       FROM parent_student_links psl
       JOIN parent_accounts pa ON pa.id = psl.parent_account_id
       JOIN students s         ON s.id = psl.student_id
       LEFT JOIN people lp     ON lp.id = s.person_id
      WHERE psl.school_id = ?
        AND psl.status = ?
      ORDER BY psl.requested_at DESC
      LIMIT 200`,
    [session.schoolId, statusFilter],
  )) as any[];

  return NextResponse.json({
    success: true,
    status: statusFilter,
    requests: rows.map(r => ({
      id:               r.id,
      student_id:       r.student_id,
      learner_name:     r.learner_name || `Learner #${r.student_id}`,
      parent_account_id: r.parent_account_id,
      parent_phone:     r.parent_phone,
      parent_name:      r.parent_name,
      relationship:     r.relationship,
      status:           r.status,
      verified_via:     r.verified_via,
      requested_at:     r.requested_at,
      approved_at:      r.approved_at,
    })),
  });
}
