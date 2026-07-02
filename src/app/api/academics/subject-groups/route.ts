/**
 * Subject groups CRUD (Phase 3 — allocation model).
 *
 * Subject groups (Sciences, Humanities, Languages, Theology, …) roll subjects
 * and departments up for reporting and analysis. School-scoped; writes require
 * academics.allocations.manage, reads require academics.allocations.view.
 *
 * GET    — list groups (with subject + department counts)
 * POST   { name, code?, description?, sort_order? }
 * PATCH  ?id  { name?, code?, description?, sort_order?, status? }
 * DELETE ?id  — soft-delete (status='archived') and unlink subjects/departments
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

async function guard(req: NextRequest, perm: string) {
  const session = await getSessionSchoolId(req);
  if (!session) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  try { await requirePermission(session.userId, session.schoolId, perm, session.isSuperAdmin); }
  catch (e) { return { error: NextResponse.json({ error: (e as Error).message }, { status: 403 }) }; }
  return { session };
}

export async function GET(req: NextRequest) {
  const g = await guard(req, 'academics.allocations.view'); if ('error' in g) return g.error;
  const rows = await query(
    `SELECT sg.id, sg.name, sg.code, sg.description, sg.sort_order, sg.status,
            (SELECT COUNT(*) FROM subjects sub WHERE sub.subject_group_id = sg.id) AS subject_count,
            (SELECT COUNT(*) FROM departments d WHERE d.subject_group_id = sg.id) AS department_count
       FROM subject_groups sg
      WHERE sg.school_id = ? AND (sg.status IS NULL OR sg.status <> 'archived')
      ORDER BY sg.sort_order ASC, sg.name ASC`,
    [g.session.schoolId],
  );
  return NextResponse.json({ success: true, rows });
}

export async function POST(req: NextRequest) {
  const g = await guard(req, 'academics.allocations.manage'); if ('error' in g) return g.error;
  const b = await req.json().catch(() => null);
  const name = (b?.name || '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const res: any = await query(
    `INSERT INTO subject_groups (school_id, name, code, description, sort_order, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    [g.session.schoolId, name, b.code || null, b.description || null, Number(b.sort_order) || 0],
  );
  return NextResponse.json({ success: true, id: res.insertId }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req, 'academics.allocations.manage'); if ('error' in g) return g.error;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const sets: string[] = []; const params: any[] = [];
  if (b.name !== undefined) { sets.push('name=?'); params.push((b.name || '').trim()); }
  if (b.code !== undefined) { sets.push('code=?'); params.push(b.code || null); }
  if (b.description !== undefined) { sets.push('description=?'); params.push(b.description || null); }
  if (b.sort_order !== undefined) { sets.push('sort_order=?'); params.push(Number(b.sort_order) || 0); }
  if (b.status !== undefined) { sets.push('status=?'); params.push(b.status || 'active'); }
  if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  params.push(id, g.session.schoolId);
  await query(`UPDATE subject_groups SET ${sets.join(', ')} WHERE id=? AND school_id=?`, params);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req, 'academics.allocations.manage'); if ('error' in g) return g.error;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  // Soft-delete and detach members so nothing dangles at a missing group.
  await query(`UPDATE subjects    SET subject_group_id = NULL WHERE subject_group_id = ?`, [id]);
  await query(`UPDATE departments SET subject_group_id = NULL WHERE subject_group_id = ?`, [id]);
  await query(`UPDATE subject_groups SET status='archived' WHERE id=? AND school_id=?`, [id, g.session.schoolId]);
  return NextResponse.json({ success: true });
}
