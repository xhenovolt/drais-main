/**
 * GET /api/portal/link/status
 * The parent's own link requests across all schools (pending + active + revoked).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getParentSession } from '@/lib/portal/session';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const session = await getParentSession(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rows = (await query(
    `SELECT psl.id, psl.school_id, sc.name AS school_name, psl.student_id,
            TRIM(CONCAT_WS(' ', lp.first_name, lp.last_name)) AS learner_name,
            psl.relationship, psl.status, psl.requested_at, psl.approved_at
       FROM parent_student_links psl
       JOIN schools sc  ON sc.id = psl.school_id AND sc.deleted_at IS NULL
       JOIN students s  ON s.id = psl.student_id
       LEFT JOIN people lp ON lp.id = s.person_id
      WHERE psl.parent_account_id = ?
      ORDER BY psl.requested_at DESC`,
    [session.parentAccountId],
  )) as any[];

  return NextResponse.json({
    success: true,
    links: rows.map(r => ({
      id:           r.id,
      school_id:    r.school_id,
      school_name:  r.school_name,
      student_id:   r.student_id,
      learner_name: r.learner_name || `Learner #${r.student_id}`,
      relationship: r.relationship,
      status:       r.status,
      requested_at: r.requested_at,
      approved_at:  r.approved_at,
    })),
  });
}
