import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';

async function assertStudent(conn: any, studentId: string, schoolId: number) {
  const [rows]: any = await conn.execute(
    `SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
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
      `SELECT id, education_type, level_name, institution, year_completed
       FROM student_education_levels WHERE student_id = ?
       ORDER BY year_completed DESC, id DESC`,
      [id]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Failed to load education history' }, { status: 500 });
  } finally { await conn.end(); }
}

/** POST replaces the whole list — pass {items:[{education_type, level_name, institution, year_completed}]}. */
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
    await conn.execute(`DELETE FROM student_education_levels WHERE student_id = ?`, [id]);
    for (const it of items) {
      const levelName = String(it.level_name || '').trim();
      const educationType = String(it.education_type || '').trim();
      if (!levelName || !educationType) continue;
      const year = it.year_completed && /^\d{4}$/.test(String(it.year_completed))
        ? Number(it.year_completed) : null;
      await conn.execute(
        `INSERT INTO student_education_levels
           (student_id, education_type, level_name, institution, year_completed)
         VALUES (?, ?, ?, ?, ?)`,
        [id, educationType, levelName, it.institution ?? null, year]
      );
    }
    await conn.commit();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    try { await conn.rollback(); } catch {}
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error(e);
    return NextResponse.json({ error: 'Failed to save education history' }, { status: 500 });
  } finally { await conn.end(); }
}
