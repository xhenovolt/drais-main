import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Programs API
 * GET  /api/programs  — List programs for school
 * POST /api/programs  — Create a new program
 */
export async function GET(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const [rows]: any = await conn.execute(
      `SELECT id, school_id, name, description, is_active, created_at
       FROM programs
       WHERE school_id = ? AND is_active = 1
       ORDER BY name ASC`,
      [schoolId]
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching programs:', error);
    return NextResponse.json({ error: 'Failed to fetch programs' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function POST(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await req.json();
    const name = (body.name ?? '').toString().trim();
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const description = (body.description ?? '').toString().trim() || null;

    const [result]: any = await conn.execute(
      `INSERT INTO programs (school_id, name, description, is_active) VALUES (?, ?, ?, 1)`,
      [schoolId, name, description]
    );

    return NextResponse.json({
      success: true,
      data: { id: result.insertId, school_id: schoolId, name, description, is_active: 1 },
    }, { status: 201 });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'A program with that name already exists' }, { status: 409 });
    }
    console.error('Error creating program:', error);
    return NextResponse.json({ error: 'Failed to create program' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function DELETE(req: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const id = req.nextUrl.searchParams.get('id');
    if (!id || !/^\d+$/.test(id)) return NextResponse.json({ error: 'Valid id is required' }, { status: 400 });

    await conn.execute(
      `UPDATE programs SET is_active = 0 WHERE id = ? AND school_id = ?`,
      [id, schoolId]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting program:', error);
    return NextResponse.json({ error: 'Failed to delete program' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
