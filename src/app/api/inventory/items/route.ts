import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';
import { requirePermission } from '@/lib/rbac';

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const __denied = await checkModule(session.schoolId, 'inventory');
    if (__denied) return __denied;
    await requirePermission(session.userId, session.schoolId, 'inventory.stock.view', session.isSuperAdmin);

    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('store_id');
    const lowStock = searchParams.get('low_stock') === '1';

    const where: string[] = ['i.school_id = ?', 'i.deleted_at IS NULL'];
    const params: any[] = [session.schoolId];
    if (storeId)  { where.push('i.store_id = ?'); params.push(storeId); }
    if (lowStock) where.push('i.reorder_level IS NOT NULL AND i.current_quantity <= i.reorder_level');

    connection = await getConnection();
    const [rows] = await connection.execute(
      `SELECT i.id, i.store_id, i.name, i.unit, i.capacity, i.reorder_level,
              i.current_quantity, i.notes, s.name AS store_name,
              CASE WHEN i.reorder_level IS NOT NULL AND i.current_quantity <= i.reorder_level
                   THEN 1 ELSE 0 END AS is_low
       FROM inventory_items i
       LEFT JOIN stores s ON i.store_id = s.id
       WHERE ${where.join(' AND ')}
       ORDER BY i.name`,
      params
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('items GET:', e);
    return NextResponse.json({ success: false, error: 'Failed to load items' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const __denied = await checkModule(session.schoolId, 'inventory');
    if (__denied) return __denied;
    await requirePermission(session.userId, session.schoolId, 'inventory.stock.manage', session.isSuperAdmin);

    const { store_id, name, unit, capacity, reorder_level, notes, initial_quantity } = await req.json();
    if (!store_id || !name) return NextResponse.json({ error: 'store_id and name required' }, { status: 400 });

    connection = await getConnection();

    // Verify store belongs to this school
    const [storeRows]: any = await connection.execute(
      `SELECT id FROM stores WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [store_id, session.schoolId]
    );
    if (!storeRows.length) return NextResponse.json({ error: 'Store not found' }, { status: 404 });

    await connection.beginTransaction();
    const qty = Number(initial_quantity) || 0;
    const [r]: any = await connection.execute(
      `INSERT INTO inventory_items
         (school_id, store_id, name, unit, capacity, reorder_level, current_quantity, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.schoolId, store_id, String(name).trim(),
        unit || null,
        capacity ? Number(capacity) : null,
        reorder_level ? Number(reorder_level) : null,
        qty,
        notes || null,
      ]
    );
    // If they seeded an opening balance, record it as a transaction for auditability
    if (qty > 0) {
      await connection.execute(
        `INSERT INTO inventory_transactions
           (school_id, item_id, tx_type, quantity, reference, balance_after, created_by)
         VALUES (?, ?, 'in', ?, 'OPENING', ?, ?)`,
        [session.schoolId, r.insertId, qty, qty, session.userId]
      );
    }
    await connection.commit();
    return NextResponse.json({ success: true, id: r.insertId }, { status: 201 });
  } catch (e: any) {
    try { if (connection) await connection.rollback(); } catch {}
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('items POST:', e);
    return NextResponse.json({ error: 'Failed to create item' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}
