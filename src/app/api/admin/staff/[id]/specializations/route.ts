import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

type Ctx = { params: Promise<{ id: string }> };

/**
 * Phase H — Staff subject specialisations CRUD.
 *
 *   GET    /api/admin/staff/[id]/specializations
 *   POST   /api/admin/staff/[id]/specializations  body: { subject_id, certified? }
 *   DELETE /api/admin/staff/[id]/specializations?subject_id=<n>
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
    `SELECT sss.id, sss.subject_id, sub.name AS subject_name, sss.certified, sss.notes, sss.created_at
       FROM staff_subject_specializations sss
       JOIN subjects sub ON sub.id = sss.subject_id
      WHERE sss.staff_id = ? AND sss.school_id = ?
      ORDER BY sub.name ASC`,
    [staffId, session.schoolId],
  );
  return NextResponse.json({ success: true, specializations: rows });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await ctx.params;
  const staffId = Number(id);
  if (!Number.isFinite(staffId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  if (!await verifyStaff(staffId, session.schoolId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const subjectId = Number(body.subject_id);
  if (!Number.isFinite(subjectId) || subjectId <= 0) {
    return NextResponse.json({ error: 'subject_id required' }, { status: 400 });
  }

  // Verify subject belongs to the school
  const subjectRows = (await query(
    `SELECT 1 FROM subjects WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [subjectId, session.schoolId],
  )) as unknown[];
  if (!subjectRows.length) return NextResponse.json({ error: 'Subject not found' }, { status: 404 });

  await query(
    `INSERT INTO staff_subject_specializations
       (staff_id, subject_id, school_id, certified, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE certified = VALUES(certified), notes = VALUES(notes)`,
    [
      staffId, subjectId, session.schoolId,
      body.certified ? 1 : 0,
      body.notes?.trim() || null,
      session.userId,
    ],
  );

  return NextResponse.json({ success: true }, { status: 201 });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await ctx.params;
  const staffId   = Number(id);
  const subjectId = Number(req.nextUrl.searchParams.get('subject_id'));

  if (!Number.isFinite(staffId) || !Number.isFinite(subjectId) || subjectId <= 0) {
    return NextResponse.json({ error: 'Invalid id or subject_id' }, { status: 400 });
  }

  const result = (await query(
    `DELETE FROM staff_subject_specializations WHERE staff_id = ? AND subject_id = ? AND school_id = ?`,
    [staffId, subjectId, session.schoolId],
  )) as { affectedRows?: number };

  if (!result.affectedRows) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
