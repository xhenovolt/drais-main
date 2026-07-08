/**
 * Shift assignments CRUD (shift engine — migration 034).
 *
 * Assigns a shift to a target with precedence staff > department > role > school.
 * GET    — list active assignments for the school (with shift + target labels)
 * POST   { shift_id, target_type: 'staff'|'department'|'role'|'school',
 *          target_id?, effective_from?, effective_to? }
 * DELETE ?id — archive one assignment
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
const TARGETS = ['staff', 'department', 'role', 'school'];

async function guard(req: NextRequest, perm: string) {
  const session = await getSessionSchoolId(req);
  if (!session) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  try { await requirePermission(session.userId, session.schoolId, perm, session.isSuperAdmin); }
  catch (e) { return { error: NextResponse.json({ error: (e as Error).message }, { status: 403 }) }; }
  return { session };
}

export async function GET(req: NextRequest) {
  const g = await guard(req, 'attendance.sessions.view'); if ('error' in g) return g.error;
  // Resolve a human label per target so the UI needn't join four ways itself.
  const rows = await query(
    `SELECT sa.id, sa.shift_id, sh.name AS shift_name, sa.target_type, sa.target_id,
            sa.effective_from, sa.effective_to, sa.status,
            CASE sa.target_type
              WHEN 'school'     THEN 'Whole school'
              WHEN 'department' THEN (SELECT d.name FROM departments d WHERE d.id = sa.target_id)
              WHEN 'role'       THEN (SELECT r.name FROM roles r WHERE r.id = sa.target_id)
              WHEN 'staff'      THEN (SELECT TRIM(CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')))
                                        FROM staff s LEFT JOIN people p ON p.id = s.person_id WHERE s.id = sa.target_id)
            END AS target_label
       FROM shift_assignments sa
       JOIN shifts sh ON sh.id = sa.shift_id
      WHERE sa.school_id = ? AND (sa.status IS NULL OR sa.status='active')
      ORDER BY FIELD(sa.target_type,'staff','department','role','school'), sh.name`,
    [g.session.schoolId],
  );
  return NextResponse.json({ success: true, rows });
}

export async function POST(req: NextRequest) {
  const g = await guard(req, 'attendance.sessions.manage'); if ('error' in g) return g.error;
  const b = await req.json().catch(() => null);
  if (!b?.shift_id || !TARGETS.includes(b.target_type)) {
    return NextResponse.json({ error: 'shift_id and a valid target_type are required' }, { status: 400 });
  }
  if (b.target_type !== 'school' && !b.target_id) {
    return NextResponse.json({ error: `target_id required for target_type '${b.target_type}'` }, { status: 400 });
  }
  // Confirm the shift belongs to this school (no cross-tenant assignment).
  const [own]: any = await query(`SELECT id FROM shifts WHERE id=? AND school_id=?`, [Number(b.shift_id), g.session.schoolId]);
  if (!own) return NextResponse.json({ error: 'Shift not found for this school' }, { status: 404 });

  const res: any = await query(
    `INSERT INTO shift_assignments
       (school_id, shift_id, target_type, target_id, effective_from, effective_to, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
    [g.session.schoolId, Number(b.shift_id), b.target_type,
     b.target_type === 'school' ? null : Number(b.target_id),
     b.effective_from || null, b.effective_to || null, g.session.userId ?? null],
  );
  return NextResponse.json({ success: true, id: res.insertId }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req, 'attendance.sessions.manage'); if ('error' in g) return g.error;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await query(`UPDATE shift_assignments SET status='archived' WHERE id=? AND school_id=?`, [id, g.session.schoolId]);
  return NextResponse.json({ success: true });
}
