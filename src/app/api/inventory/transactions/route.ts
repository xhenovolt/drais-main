import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';
import { requirePermission } from '@/lib/rbac';

/**
 * Inventory transactions — every stock movement (in/out/adjust) is
 * recorded as a row + atomically updates inventory_items.current_quantity.
 *   - 'in':     increment stock
 *   - 'out':    decrement stock (refuses if it would go negative)
 *   - 'adjust': set absolute value (quantity = new total); useful for
 *               stock-take corrections
 */
export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const __denied = await checkModule(session.schoolId, 'inventory');
    if (__denied) return __denied;
    await requirePermission(session.userId, session.schoolId, 'inventory.stock.view', session.isSuperAdmin);

    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('item_id');
    const where: string[] = ['t.school_id = ?', 't.deleted_at IS NULL'];
    const params: any[] = [session.schoolId];
    if (itemId) { where.push('t.item_id = ?'); params.push(itemId); }

    connection = await getConnection();
    const [rows] = await connection.execute(
      `SELECT t.id, t.item_id, t.tx_type, t.quantity, t.reference, t.notes,
              t.balance_after, t.created_at, t.created_by,
              i.name AS item_name, i.unit
       FROM inventory_transactions t
       LEFT JOIN inventory_items i ON t.item_id = i.id
       WHERE ${where.join(' AND ')}
       ORDER BY t.created_at DESC, t.id DESC
       LIMIT 500`,
      params
    );
    return NextResponse.json({ success: true, data: rows });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('inv tx GET:', e);
    return NextResponse.json({ success: false, error: 'Failed to load transactions' }, { status: 500 });
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

    const { item_id, tx_type, quantity, reference, notes } = await req.json();
    const qty = Number(quantity);
    if (!item_id || !tx_type || !qty || qty <= 0) {
      return NextResponse.json({ error: 'item_id, tx_type, quantity (>0) required' }, { status: 400 });
    }
    if (!['in', 'out', 'adjust'].includes(tx_type)) {
      return NextResponse.json({ error: 'tx_type must be in/out/adjust' }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    const [itemRows]: any = await connection.execute(
      `SELECT id, current_quantity FROM inventory_items
       WHERE id = ? AND school_id = ? AND deleted_at IS NULL FOR UPDATE`,
      [item_id, session.schoolId]
    );
    if (!itemRows.length) {
      await connection.rollback();
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const current = Number(itemRows[0].current_quantity);
    let newBalance: number;
    if (tx_type === 'in') {
      newBalance = current + qty;
    } else if (tx_type === 'out') {
      if (qty > current) {
        await connection.rollback();
        return NextResponse.json({ error: `Insufficient stock — have ${current}, need ${qty}` }, { status: 400 });
      }
      newBalance = current - qty;
    } else {
      newBalance = qty;
    }

    const [ins]: any = await connection.execute(
      `INSERT INTO inventory_transactions
         (school_id, item_id, tx_type, quantity, reference, notes, balance_after, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [session.schoolId, item_id, tx_type, qty, reference || null, notes || null, newBalance, session.userId]
    );
    await connection.execute(
      `UPDATE inventory_items SET current_quantity = ? WHERE id = ?`,
      [newBalance, item_id]
    );

    await connection.commit();
    return NextResponse.json({ success: true, id: ins.insertId, balance_after: newBalance }, { status: 201 });
  } catch (e: any) {
    try { if (connection) await connection.rollback(); } catch {}
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('inv tx POST:', e);
    return NextResponse.json({ error: 'Failed to record transaction' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}
