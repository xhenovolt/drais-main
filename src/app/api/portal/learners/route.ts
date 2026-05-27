/**
 * GET /api/portal/learners
 * The parent's linked learners in the ACTIVE school. Gated: only active links.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requirePortalContext } from '@/lib/portal/context';
import { authorizedStudentIds } from '@/lib/portal/guard';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const res = await requirePortalContext(req);
  if ('error' in res) return res.error;
  const { session, schoolId } = res.ctx;

  const ids = await authorizedStudentIds(session.parentAccountId, schoolId);
  if (!ids.length) return NextResponse.json({ success: true, learners: [] });

  const placeholders = ids.map(() => '?').join(',');
  const rows = (await query(
    `SELECT s.id, s.admission_no, s.status,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name,
            p.photo_url,
            c.name AS class_name
       FROM students s
       LEFT JOIN people p  ON p.id = s.person_id
       LEFT JOIN classes c ON c.id = s.class_id
      WHERE s.id IN (${placeholders}) AND s.school_id = ? AND s.deleted_at IS NULL`,
    [...ids, schoolId],
  )) as any[];

  return NextResponse.json({
    success: true,
    learners: rows.map(r => ({
      id: r.id, name: r.name || `Learner #${r.id}`, admission_no: r.admission_no,
      status: r.status, class_name: r.class_name, photo_url: r.photo_url,
    })),
  });
}
