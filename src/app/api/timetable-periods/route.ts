import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    connection = await getConnection();
    const [rows] = await connection.execute(
      'SELECT id, name, short_name, start_time, end_time, period_order, is_break FROM timetable_periods WHERE school_id = ? ORDER BY period_order ASC',
      [session.schoolId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (e: any) {
    console.error('Timetable periods GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    if (!body.name?.trim() || !body.start_time || !body.end_time) {
      return NextResponse.json({ error: 'name, start_time, and end_time are required.' }, { status: 400 });
    }

    connection = await getConnection();
    const [result] = await connection.execute(
      'INSERT INTO timetable_periods (school_id, name, short_name, start_time, end_time, period_order, is_break) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [session.schoolId, body.name.trim(), body.short_name || null, body.start_time, body.end_time, body.period_order || 0, body.is_break || false]
    );
    return NextResponse.json({ success: true, id: (result as any).insertId }, { status: 201 });
  } catch (e: any) {
    console.error('Timetable periods POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const body = await req.json();
    if (!body.id) return NextResponse.json({ error: 'id required.' }, { status: 400 });

    connection = await getConnection();
    await connection.execute(
      'UPDATE timetable_periods SET name=?, short_name=?, start_time=?, end_time=?, period_order=?, is_break=? WHERE id=? AND school_id=?',
      [body.name, body.short_name || null, body.start_time, body.end_time, body.period_order || 0, body.is_break || false, body.id, session.schoolId]
    );
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required.' }, { status: 400 });

    connection = await getConnection();
    await connection.execute('DELETE FROM timetable_periods WHERE id=? AND school_id=?', [id, session.schoolId]);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
