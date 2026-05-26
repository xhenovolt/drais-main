import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'inventory.stock.view', session.isSuperAdmin);

    connection = await getConnection();
    const [rows] = await connection.execute(
      `SELECT s.id, s.name, s.location, s.notes,
              (SELECT COUNT(*) FROM inventory_items i
                 WHERE i.store_id = s.id AND i.deleted_at IS NULL) AS item_count
       FROM stores s
       WHERE s.school_id = ? AND s.deleted_at IS NULL
       ORDER BY s.name`,
      [session.schoolId]
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('stores GET:', e);
    return NextResponse.json({ success: false, error: 'Failed to load stores' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'inventory.stock.manage', session.isSuperAdmin);

    const { name, location, notes } = await req.json();
    if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });

    connection = await getConnection();
    const [r]: any = await connection.execute(
      `INSERT INTO stores (school_id, name, location, notes) VALUES (?, ?, ?, ?)`,
      [session.schoolId, String(name).trim(), location || null, notes || null]
    );
    return NextResponse.json({ success: true, id: r.insertId }, { status: 201 });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('stores POST:', e);
    return NextResponse.json({ error: 'Failed to create store' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'inventory.stock.manage', session.isSuperAdmin);

    const { id, name, location, notes } = await req.json();
    if (!id || !name) return NextResponse.json({ error: 'id and name required' }, { status: 400 });

    connection = await getConnection();
    const [r]: any = await connection.execute(
      `UPDATE stores SET name = ?, location = ?, notes = ?
       WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [String(name).trim(), location || null, notes || null, id, session.schoolId]
    );
    if (r.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('stores PUT:', e);
    return NextResponse.json({ error: 'Failed to update store' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

export async function DELETE(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'inventory.stock.manage', session.isSuperAdmin);

    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    connection = await getConnection();

    // Block delete if store has active items
    const [itemRows]: any = await connection.execute(
      `SELECT COUNT(*) AS n FROM inventory_items
       WHERE store_id = ? AND deleted_at IS NULL`,
      [id]
    );
    if (Number(itemRows[0].n) > 0) {
      return NextResponse.json({ error: 'Store has items — archive or move them first' }, { status: 409 });
    }

    const [r]: any = await connection.execute(
      `UPDATE stores SET deleted_at = NOW(), deleted_by = ?
       WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [session.userId, id, session.schoolId]
    );
    if (r.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('stores DELETE:', e);
    return NextResponse.json({ error: 'Failed to delete store' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}
