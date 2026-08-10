/**
 * GET /api/academics/allocations/my-subjects[?class_id=]
 *
 * Returns the subjects the logged-in teacher is ACTIVELY allocated to, so the
 * result-entry UI can gate its subject picker (Phase 6). Privileged callers
 * (super-admin or holders of academics.allocations.manage) get `privileged:true`
 * and the UI may show every subject.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { userCan } from '@/lib/rbac';
import { query } from '@/lib/db';
import { checkModule } from '@/lib/auth/requireModule';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'academics');
  if (modDenied) return modDenied;

  const privileged = session.isSuperAdmin || (await userCan(session.userId, session.schoolId, 'academics.allocations.manage'));
  const classId = Number(req.nextUrl.searchParams.get('class_id')) || null;

  // A teacher with no staff record can never be allocated → empty set.
  if (!session.staffId) {
    return NextResponse.json({ success: true, privileged, staffId: null, subject_ids: [], rows: [] });
  }

  const params: any[] = [session.staffId];
  let classFilter = '';
  if (classId) { classFilter = 'AND cs.class_id = ?'; params.push(classId); }

  const rows = (await query(
    `SELECT DISTINCT cs.subject_id, cs.class_id, sub.name AS subject_name, c.name AS class_name, cs.allocation_role
       FROM class_subjects cs
       JOIN subjects sub ON sub.id = cs.subject_id
       JOIN classes   c  ON c.id  = cs.class_id AND c.school_id = ?
      WHERE cs.teacher_id = ?
        ${classFilter}
        AND (cs.valid_to IS NULL OR cs.valid_to > CURDATE())
        AND (cs.status IS NULL OR cs.status = 'active')
      ORDER BY c.name, sub.name`,
    [session.schoolId, ...params],
  )) as any[];

  const subject_ids = [...new Set(rows.map((r) => Number(r.subject_id)))];
  return NextResponse.json({ success: true, privileged, staffId: session.staffId, subject_ids, rows });
}
