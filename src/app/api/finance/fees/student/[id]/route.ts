import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { computeFeeItemStatus, updateFeeItemStatus } from '@/lib/services/FeeService';
import FeeStatusMiddleware from '@/lib/middleware/feeStatusMiddleware';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let connection;
  
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const resolvedParams = await params;
    const feeItemId = parseInt(resolvedParams.id, 10);
    const body = await req.json();
    const { amount, discount, waived, due_date } = body;

    connection = await getConnection();

    // Update fee item
    const [result] = await connection.execute(`
      UPDATE student_fee_items 
      SET 
        amount = COALESCE(?, amount),
        discount = COALESCE(?, discount),
        waived = COALESCE(?, waived),
        due_date = COALESCE(?, due_date),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [amount, discount, waived, due_date, feeItemId]);

    if (result.affectedRows === 0) {
      return NextResponse.json({
        success: false,
        error: 'Fee item not found'
      }, { status: 404 });
    }

    // Update status using middleware
    await FeeStatusMiddleware.afterFeeModification(feeItemId);

    // Fetch updated item with computed status
    const [updatedItems] = await connection.execute(`
      SELECT * FROM student_fee_items WHERE id = ?
    `, [feeItemId]);

    const updatedItem = updatedItems[0] as any;
    updatedItem.status = computeFeeItemStatus(updatedItem);

    return NextResponse.json({
      success: true,
      data: updatedItem,
      message: 'Fee item updated successfully'
    });

  } catch (error: any) {
    console.error('Fee item update error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update fee item'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
