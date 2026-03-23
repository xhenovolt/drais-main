import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const [rows] = await conn.execute(
      `SELECT id, school_id, name, start_date, end_date, status
       FROM academic_years
       WHERE school_id = ?
         AND deleted_at IS NULL
       ORDER BY start_date DESC, id DESC`,
      [schoolId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching academic years:', error);
    return NextResponse.json({ error: 'Failed to fetch academic years' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function POST(request: NextRequest) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const body = await request.json();
    const { name, start_date, end_date, status } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    const [result]: any = await conn.execute(
      `INSERT INTO academic_years (school_id, name, start_date, end_date, status)
       VALUES (?, ?, ?, ?, ?)`,
      [schoolId, name, start_date || null, end_date || null, status || 'draft']
    );

    return NextResponse.json({ success: true, id: result.insertId });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'Academic year already exists' }, { status: 409 });
    }
    console.error('Error creating academic year:', error);
    return NextResponse.json({ error: 'Failed to create academic year' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
