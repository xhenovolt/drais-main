import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';

/**
 * Reversing a transaction: soft-delete the row and reverse its effect
 * on inventory_items.current_quantity:
 *   - 'in'  reversed: subtract its quantity
 *   - 'out' reversed: add it back
 *   - 'adjust' reversed: cannot be cleanly reversed (no record of the
 *     prior balance before the adjust). Refuses; use a new 'adjust' tx
 *     instead.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    await requirePermission(session.userId, session.schoolId, 'inventory.stock.manage', session.isSuperAdmin);

    const { id } = await params;
    connection = await getConnection();
    await connection.beginTransaction();

    const [txRows]: any = await connection.execute(
      `SELECT t.id, t.item_id, t.tx_type, t.quantity
       FROM inventory_transactions t
       WHERE t.id = ? AND t.school_id = ? AND t.deleted_at IS NULL FOR UPDATE`,
      [id, session.schoolId]
    );
    if (!txRows.length) {
      await connection.rollback();
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const tx = txRows[0];

    if (tx.tx_type === 'adjust') {
      await connection.rollback();
      return NextResponse.json({
        error: "Cannot reverse an 'adjust' transaction — record a new adjust with the corrected total instead.",
      }, { status: 400 });
    }

    const [itemRows]: any = await connection.execute(
      `SELECT current_quantity FROM inventory_items WHERE id = ? FOR UPDATE`,
      [tx.item_id]
    );
    if (!itemRows.length) {
      await connection.rollback();
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }
    const current = Number(itemRows[0].current_quantity);
    const qty = Number(tx.quantity);

    let newBalance: number;
    if (tx.tx_type === 'in') {
      if (qty > current) {
        await connection.rollback();
        return NextResponse.json({ error: `Cannot reverse: stock has been used (have ${current}, need to remove ${qty})` }, { status: 400 });
      }
      newBalance = current - qty;
    } else {
      newBalance = current + qty;
    }

    await connection.execute(
      `UPDATE inventory_transactions SET deleted_at = NOW(), deleted_by = ?
       WHERE id = ?`,
      [session.userId, id]
    );
    await connection.execute(
      `UPDATE inventory_items SET current_quantity = ? WHERE id = ?`,
      [newBalance, tx.item_id]
    );

    await connection.commit();
    return NextResponse.json({ success: true, balance_after: newBalance });
  } catch (e: any) {
    try { if (connection) await connection.rollback(); } catch {}
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('inv tx DELETE:', e);
    return NextResponse.json({ error: 'Failed to reverse transaction' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}
