import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  let connection;

  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // schoolId derived from session below

    connection = await getConnection();

    const [terms] = await connection.execute(
      `
      SELECT 
        t.id,
        t.name,
        t.start_date,
        t.end_date,
        t.status,
        ay.name as academic_year
      FROM terms t
      LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
      WHERE t.school_id = ?
        AND t.deleted_at IS NULL
      ORDER BY t.start_date DESC
    `,
      [schoolId]
    );

    return NextResponse.json({
      success: true,
      data: terms,
    });
  } catch (error: any) {
    console.error('Terms fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch terms',
      },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  // schoolId comes from session (school_id variable)
  const academic_year_id = body.academic_year_id || 1;
  const start_date = body.start_date || null;
  const end_date = body.end_date || null;
  const status = body.status || 'scheduled';
  const connection = await getConnection();
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const [result] = await connection.execute(
      'INSERT INTO terms (school_id, academic_year_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?, ?)',
      [schoolId, academic_year_id, name, start_date, end_date, status]
    );
    const insertId = (result as any).insertId;
    await connection.end();
    return NextResponse.json({ success: true, id: insertId }, { status: 201 });
  } catch (e: any) {
    await connection.end();
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
