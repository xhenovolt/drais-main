import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { checkAnyPermission } from '@/lib/rbac';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Phase H — Staff qualifications CRUD.
 *
 *   GET    /api/admin/staff/[id]/qualifications  → list
 *   POST   /api/admin/staff/[id]/qualifications  → add
 *   DELETE /api/admin/staff/[id]/qualifications?qual_id=<n>  → remove one
 */

async function verifyStaff(staffId: number, schoolId: number): Promise<boolean> {
  const rows = (await query(
    `SELECT 1 FROM staff WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [staffId, schoolId],
  )) as unknown[];
  return rows.length > 0;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await ctx.params;
  const staffId = Number(id);
  if (!Number.isFinite(staffId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  if (!await verifyStaff(staffId, session.schoolId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const rows = await query(
    `SELECT id, degree_type, institution, field_of_study, year_obtained, document_url, notes, created_at
       FROM staff_qualifications
      WHERE staff_id = ? AND school_id = ?
      ORDER BY year_obtained DESC, id DESC`,
    [staffId, session.schoolId],
  );
  return NextResponse.json({ success: true, qualifications: rows });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const denied = await checkAnyPermission(session.userId, session.schoolId, ['staff.qualifications.manage', 'staff.update'], session.isSuperAdmin);
  if (denied) return denied;

  const { id } = await ctx.params;
  const staffId = Number(id);
  if (!Number.isFinite(staffId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  if (!await verifyStaff(staffId, session.schoolId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { degree_type, institution, field_of_study, year_obtained, document_url, notes } = body;

  if (!degree_type?.trim() || !institution?.trim()) {
    return NextResponse.json({ error: 'degree_type and institution are required' }, { status: 400 });
  }

  const result = (await query(
    `INSERT INTO staff_qualifications
       (staff_id, school_id, degree_type, institution, field_of_study, year_obtained, document_url, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      staffId, session.schoolId, degree_type.trim(), institution.trim(),
      field_of_study?.trim() || null,
      year_obtained ? Number(year_obtained) : null,
      document_url?.trim() || null,
      notes?.trim() || null,
      session.userId,
    ],
  )) as { insertId?: number };

  return NextResponse.json({ success: true, id: result.insertId }, { status: 201 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const denied = await checkAnyPermission(session.userId, session.schoolId, ['staff.qualifications.manage', 'staff.update'], session.isSuperAdmin);
  if (denied) return denied;

  const { id } = await ctx.params;
  const staffId = Number(id);
  const qualId  = Number(req.nextUrl.searchParams.get('qual_id'));

  if (!Number.isFinite(staffId) || !Number.isFinite(qualId) || qualId <= 0) {
    return NextResponse.json({ error: 'Invalid id or qual_id' }, { status: 400 });
  }

  const result = (await query(
    `DELETE FROM staff_qualifications WHERE id = ? AND staff_id = ? AND school_id = ?`,
    [qualId, staffId, session.schoolId],
  )) as { affectedRows?: number };

  if (!result.affectedRows) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
