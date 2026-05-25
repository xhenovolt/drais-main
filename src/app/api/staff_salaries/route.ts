import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';

/**
 * Staff salaries — per (staff, year-month, definition) line items that
 * make up the monthly payroll. GET returns a bare array including
 * staff_name and definition_name for display.
 */
export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'payroll.salaries.view', session.isSuperAdmin);

    connection = await getConnection();
    const [rows] = await connection.execute(
      `SELECT ss.id, ss.staff_id, ss.month, ss.period_month, ss.definition_id, ss.amount,
              CONCAT(p.first_name, ' ', p.last_name) AS staff_name,
              pd.name AS definition_name, pd.type AS definition_type
       FROM staff_salaries ss
       JOIN staff s ON ss.staff_id = s.id
       LEFT JOIN people p ON s.person_id = p.id
       LEFT JOIN payroll_definitions pd ON ss.definition_id = pd.id
       WHERE ss.school_id = ?
       ORDER BY ss.month DESC, ss.period_month DESC, ss.id DESC`,
      [session.schoolId]
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('staff_salaries GET:', e);
    return NextResponse.json({ error: 'Failed to load staff salaries' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'payroll.salaries.manage', session.isSuperAdmin);

    const { staff_id, month, period_month, definition_id, amount } = await req.json();
    if (!staff_id || !definition_id || amount == null) {
      return NextResponse.json({ error: 'staff_id, definition_id, amount required' }, { status: 400 });
    }

    connection = await getConnection();

    // Verify staff belongs to this school
    const [staffRows]: any = await connection.execute(
      `SELECT id FROM staff WHERE id = ? AND school_id = ?`,
      [staff_id, session.schoolId]
    );
    if (!staffRows.length) return NextResponse.json({ error: 'Staff not found' }, { status: 404 });

    const [r]: any = await connection.execute(
      `INSERT INTO staff_salaries (school_id, staff_id, month, period_month, definition_id, amount)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [session.schoolId, staff_id, month || null, period_month || null, definition_id, amount]
    );
    return NextResponse.json({ success: true, id: r.insertId }, { status: 201 });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('staff_salaries POST:', e);
    return NextResponse.json({ error: 'Failed to create salary record' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'payroll.salaries.manage', session.isSuperAdmin);

    const { id, staff_id, month, period_month, definition_id, amount } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    connection = await getConnection();
    const [r]: any = await connection.execute(
      `UPDATE staff_salaries
         SET staff_id = ?, month = ?, period_month = ?, definition_id = ?, amount = ?
       WHERE id = ? AND school_id = ?`,
      [staff_id, month || null, period_month || null, definition_id, amount, id, session.schoolId]
    );
    if (r.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('staff_salaries PUT:', e);
    return NextResponse.json({ error: 'Failed to update salary record' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

export async function DELETE(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'payroll.salaries.manage', session.isSuperAdmin);

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    connection = await getConnection();
    // staff_salaries has no soft-delete columns — hard delete is the only option here.
    const [r]: any = await connection.execute(
      `DELETE FROM staff_salaries WHERE id = ? AND school_id = ?`,
      [id, session.schoolId]
    );
    if (r.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('staff_salaries DELETE:', e);
    return NextResponse.json({ error: 'Failed to delete salary record' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}
