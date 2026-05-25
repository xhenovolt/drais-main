import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';

/**
 * Payroll definitions — per-school catalog of salary line items
 * (base salary, allowance, deduction, bonus). GET returns a bare array
 * to match the existing UI in src/app/payroll/definitions/page.tsx.
 */
export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'payroll.salaries.view', session.isSuperAdmin);

    connection = await getConnection();
    const [rows] = await connection.execute(
      `SELECT id, name, type
       FROM payroll_definitions
       WHERE school_id = ? AND deleted_at IS NULL
       ORDER BY name`,
      [session.schoolId]
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('payroll_definitions GET:', e);
    return NextResponse.json({ error: 'Failed to load payroll definitions' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'payroll.salaries.manage', session.isSuperAdmin);

    const { name, type } = await req.json();
    if (!name || !type) return NextResponse.json({ error: 'name and type required' }, { status: 400 });

    connection = await getConnection();
    const [r]: any = await connection.execute(
      `INSERT INTO payroll_definitions (school_id, name, type) VALUES (?, ?, ?)`,
      [session.schoolId, String(name).trim(), String(type).trim()]
    );
    return NextResponse.json({ success: true, id: r.insertId }, { status: 201 });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('payroll_definitions POST:', e);
    return NextResponse.json({ error: 'Failed to create payroll definition' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'payroll.salaries.manage', session.isSuperAdmin);

    const { id, name, type } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    connection = await getConnection();
    const [r]: any = await connection.execute(
      `UPDATE payroll_definitions SET name = ?, type = ?
       WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [String(name).trim(), String(type).trim(), id, session.schoolId]
    );
    if (r.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('payroll_definitions PUT:', e);
    return NextResponse.json({ error: 'Failed to update payroll definition' }, { status: 500 });
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
    const [r]: any = await connection.execute(
      `UPDATE payroll_definitions SET deleted_at = NOW(), deleted_by = ?
       WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [session.userId, id, session.schoolId]
    );
    if (r.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('payroll_definitions DELETE:', e);
    return NextResponse.json({ error: 'Failed to delete payroll definition' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}
