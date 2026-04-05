import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    connection = await getConnection();
    const [rows] = await connection.execute(
      'SELECT * FROM payroll_definitions WHERE school_id = ? ORDER BY name',
      [schoolId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('payroll_definitions GET error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { name, type } = await req.json();
    connection = await getConnection();
    await connection.execute(
      'INSERT INTO payroll_definitions (school_id, name, type) VALUES (?, ?, ?)',
      [schoolId, name, type]
    );
    return NextResponse.json({ success: true, message: 'Payroll definition created' });
  } catch (error: any) {
    console.error('payroll_definitions POST error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { id, name, type } = await req.json();
    connection = await getConnection();
    await connection.execute(
      'UPDATE payroll_definitions SET name = ?, type = ? WHERE id = ? AND school_id = ?',
      [name, type, id, schoolId]
    );
    return NextResponse.json({ success: true, message: 'Payroll definition updated' });
  } catch (error: any) {
    console.error('payroll_definitions PUT error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { id } = await req.json();
    connection = await getConnection();
    await connection.execute('DELETE FROM payroll_definitions WHERE id = ? AND school_id = ?', [id, schoolId]);
    return NextResponse.json({ success: true, message: 'Payroll definition deleted' });
  } catch (error: any) {
    console.error('payroll_definitions DELETE error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}