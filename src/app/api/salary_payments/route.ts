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
      'SELECT sp.*, CONCAT(p.first_name, " ", p.last_name) as staff_name FROM salary_payments sp JOIN staff s ON sp.staff_id = s.id LEFT JOIN people p ON s.person_id = p.id WHERE sp.school_id = ? ORDER BY sp.paid_at DESC',
      [schoolId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('salary_payments GET error:', error);
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

    const { staff_id, wallet_id, amount, method, reference } = await req.json();
    connection = await getConnection();
    await connection.execute(
      'INSERT INTO salary_payments (school_id, staff_id, wallet_id, amount, method, reference) VALUES (?, ?, ?, ?, ?, ?)',
      [schoolId, staff_id, wallet_id, amount, method, reference]
    );
    return NextResponse.json({ success: true, message: 'Salary payment recorded' });
  } catch (error: any) {
    console.error('salary_payments POST error:', error);
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

    const { id, staff_id, wallet_id, amount, method, reference } = await req.json();
    connection = await getConnection();
    await connection.execute(
      'UPDATE salary_payments SET staff_id = ?, wallet_id = ?, amount = ?, method = ?, reference = ? WHERE id = ? AND school_id = ?',
      [staff_id, wallet_id, amount, method, reference, id, schoolId]
    );
    return NextResponse.json({ success: true, message: 'Salary payment updated' });
  } catch (error: any) {
    console.error('salary_payments PUT error:', error);
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
    await connection.execute('DELETE FROM salary_payments WHERE id = ? AND school_id = ?', [id, schoolId]);
    return NextResponse.json({ success: true, message: 'Salary payment deleted' });
  } catch (error: any) {
    console.error('salary_payments DELETE error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}