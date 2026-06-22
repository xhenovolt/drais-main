/**
 * GET  /api/tahfiz/books/custom   list this school's custom books
 * POST /api/tahfiz/books/custom   create a custom book
 *   body: { title, structure_type?, unit_label?, total_units?, teaching_order? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';

const TYPES = ['ordered_lessons', 'versed_poem', 'chaptered_text'];

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const rows = (await query(
    `SELECT id, title, structure_type, unit_label, total_units, teaching_order, status
       FROM tahfiz_custom_books WHERE school_id = ? AND deleted_at IS NULL ORDER BY title`,
    [session.schoolId],
  )) as any[];
  return NextResponse.json({ success: true, custom: rows });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'tahfiz.books.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  const title = (body?.title ? String(body.title) : '').trim().slice(0, 150);
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 });
  const structureType = TYPES.includes(body?.structure_type) ? body.structure_type : 'ordered_lessons';
  const unitLabel = body?.unit_label ? String(body.unit_label).slice(0, 40) : (structureType === 'versed_poem' ? 'bayt' : 'lesson');

  const res: any = await query(
    `INSERT INTO tahfiz_custom_books (school_id, title, structure_type, unit_label, total_units, teaching_order, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [session.schoolId, title, structureType, unitLabel, body?.total_units ?? null, body?.teaching_order ?? null, session.userId],
  );
  return NextResponse.json({ success: true, id: res.insertId, title });
}
