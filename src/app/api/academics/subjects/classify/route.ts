/**
 * Classify a subject into a department and/or subject group (Phase 3).
 *
 * GET    — list this school's subjects with their current department + group.
 * PATCH  ?id  { department_id?: number|null, subject_group_id?: number|null }
 *
 * Writes require academics.allocations.manage; reads academics.allocations.view.
 * The report card reads these classifications (Phase 7 bindings) frozen at
 * snapshot generation, so changing them only affects future snapshots.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { checkModule } from '@/lib/auth/requireModule';

export const runtime = 'nodejs';

async function guard(req: NextRequest, perm: string) {
  const session = await getSessionSchoolId(req);
  if (!session) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  const modDenied = await checkModule(session.schoolId, 'academics');
  if (modDenied) return { error: modDenied };
  try { await requirePermission(session.userId, session.schoolId, perm, session.isSuperAdmin); }
  catch (e) { return { error: NextResponse.json({ error: (e as Error).message }, { status: 403 }) }; }
  return { session };
}

export async function GET(req: NextRequest) {
  const g = await guard(req, 'academics.allocations.view'); if ('error' in g) return g.error;
  const rows = await query(
    `SELECT sub.id, sub.name, sub.code, sub.department_id, sub.subject_group_id,
            dep.name AS department_name, sg.name AS subject_group_name
       FROM subjects sub
       LEFT JOIN departments    dep ON dep.id = sub.department_id
       LEFT JOIN subject_groups sg  ON sg.id  = sub.subject_group_id
      WHERE sub.school_id = ?
      ORDER BY sub.name ASC`,
    [g.session.schoolId],
  );
  return NextResponse.json({ success: true, rows });
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req, 'academics.allocations.manage'); if ('error' in g) return g.error;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const sets: string[] = []; const params: any[] = [];
  if (b.department_id !== undefined) { sets.push('department_id=?'); params.push(b.department_id ? Number(b.department_id) : null); }
  if (b.subject_group_id !== undefined) { sets.push('subject_group_id=?'); params.push(b.subject_group_id ? Number(b.subject_group_id) : null); }
  if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  params.push(id, g.session.schoolId);
  await query(`UPDATE subjects SET ${sets.join(', ')} WHERE id=? AND school_id=?`, params);
  return NextResponse.json({ success: true });
}
