import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';

async function assertStudent(conn: any, studentId: string, schoolId: number) {
  const [rows]: any = await conn.execute(
    `SELECT id FROM students WHERE id = ? AND school_id = ?`,
    [studentId, schoolId]
  );
  return rows.length > 0;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'learners.profile.view', session.isSuperAdmin);

    const { id } = await params;
    if (!await assertStudent(conn, id, session.schoolId)) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    const [rows]: any = await conn.execute(
      `SELECT id, sequence, name, address, occupation, contact
       FROM student_next_of_kin WHERE student_id = ? ORDER BY sequence ASC, id ASC`,
      [id]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Failed to load next of kin' }, { status: 500 });
  } finally { await conn.end(); }
}

/** POST replaces the whole list — pass an array of {sequence, name, address, occupation, contact}. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'learners.profile.update', session.isSuperAdmin);

    const { id } = await params;
    if (!await assertStudent(conn, id, session.schoolId)) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    const body = await req.json();
    const items: any[] = Array.isArray(body?.items) ? body.items : [];

    await conn.beginTransaction();
    await conn.execute(`DELETE FROM student_next_of_kin WHERE student_id = ?`, [id]);
    let seq = 1;
    for (const it of items) {
      const name = String(it.name || '').trim();
      if (!name) continue;
      await conn.execute(
        `INSERT INTO student_next_of_kin (student_id, sequence, name, address, occupation, contact)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [id, it.sequence ?? seq++, name, it.address ?? null, it.occupation ?? null, it.contact ?? null]
      );
    }
    await conn.commit();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    try { await conn.rollback(); } catch {}
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Failed to save next of kin' }, { status: 500 });
  } finally { await conn.end(); }
}
