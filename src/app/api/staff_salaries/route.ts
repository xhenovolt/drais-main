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
      'SELECT ss.*, CONCAT(p.first_name, " ", p.last_name) as staff_name FROM staff_salaries ss JOIN staff s ON ss.staff_id = s.id LEFT JOIN people p ON s.person_id = p.id WHERE ss.school_id = ? ORDER BY ss.id DESC',
      [schoolId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('staff_salaries GET error:', error);
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

    const { staff_id, month, period_month, definition_id, amount } = await req.json();
    connection = await getConnection();
    await connection.execute(
      'INSERT INTO staff_salaries (school_id, staff_id, month, period_month, definition_id, amount) VALUES (?, ?, ?, ?, ?, ?)',
      [schoolId, staff_id, month, period_month, definition_id, amount]
    );
    return NextResponse.json({ success: true, message: 'Salary record created' });
  } catch (error: any) {
    console.error('staff_salaries POST error:', error);
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

    const { id, staff_id, month, period_month, definition_id, amount } = await req.json();
    connection = await getConnection();
    await connection.execute(
      'UPDATE staff_salaries SET staff_id = ?, month = ?, period_month = ?, definition_id = ?, amount = ? WHERE id = ? AND school_id = ?',
      [staff_id, month, period_month, definition_id, amount, id, schoolId]
    );
    return NextResponse.json({ success: true, message: 'Salary record updated' });
  } catch (error: any) {
    console.error('staff_salaries PUT error:', error);
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
    await connection.execute('DELETE FROM staff_salaries WHERE id = ? AND school_id = ?', [id, schoolId]);
    return NextResponse.json({ success: true, message: 'Salary record deleted' });
  } catch (error: any) {
    console.error('staff_salaries DELETE error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}