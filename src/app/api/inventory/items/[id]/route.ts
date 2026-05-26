import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'inventory.stock.manage', session.isSuperAdmin);

    const { id } = await params;
    const { name, unit, capacity, reorder_level, notes, store_id } = await req.json();

    connection = await getConnection();
    const [r]: any = await connection.execute(
      `UPDATE inventory_items SET
         name           = COALESCE(?, name),
         unit           = COALESCE(?, unit),
         capacity       = COALESCE(?, capacity),
         reorder_level  = COALESCE(?, reorder_level),
         notes          = COALESCE(?, notes),
         store_id       = COALESCE(?, store_id)
       WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [
        name ?? null,
        unit ?? null,
        capacity != null ? Number(capacity) : null,
        reorder_level != null ? Number(reorder_level) : null,
        notes ?? null,
        store_id ?? null,
        id, session.schoolId,
      ]
    );
    if (r.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('item PUT:', e);
    return NextResponse.json({ error: 'Failed to update item' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'inventory.stock.manage', session.isSuperAdmin);

    const { id } = await params;
    connection = await getConnection();
    const [r]: any = await connection.execute(
      `UPDATE inventory_items SET deleted_at = NOW(), deleted_by = ?
       WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [session.userId, id, session.schoolId]
    );
    if (r.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('item DELETE:', e);
    return NextResponse.json({ error: 'Failed to delete item' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}
