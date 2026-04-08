import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { updateFeeItemStatus, batchUpdateFeeItemStatuses } from '@/lib/services/FeeService';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const studentId = searchParams.get('student_id');
    const termId = searchParams.get('term_id');
    const status = searchParams.get('status');
    const walletId = searchParams.get('wallet_id');
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    connection = await getConnection();

    let sql = `
      SELECT 
        fp.id,
        fp.student_id,
        fp.term_id,
        fp.wallet_id,
        fp.amount,
        fp.discount_applied,
        fp.tax_amount,
        fp.method,
        fp.paid_by,
        fp.payer_contact,
        fp.reference,
        fp.gateway_reference,
        fp.receipt_no,
        fp.payment_status as status,
        fp.created_at,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        s.admission_no,
        c.name as class_name,
        t.name as term_name,
        w.name as wallet_name,
        COALESCE(w.currency, 'UGX') as currency,
        r.receipt_no as receipt_number,
        r.file_url as receipt_url,
        pr.status as reconciliation_status
      FROM fee_payments fp
      JOIN students s ON fp.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN terms t ON fp.term_id = t.id
      LEFT JOIN wallets w ON fp.wallet_id = w.id
      LEFT JOIN receipts r ON fp.id = r.payment_id
      LEFT JOIN payment_reconciliations pr ON fp.id = pr.payment_id
      WHERE fp.student_id IN (
        SELECT s2.id FROM students s2 WHERE s2.school_id = ?
      )
    `;

    const params = [schoolId];

    if (studentId) {
      sql += ' AND fp.student_id = ?';
      params.push(parseInt(studentId, 10));
    }

    if (termId) {
      sql += ' AND fp.term_id = ?';
      params.push(parseInt(termId, 10));
    }

    if (status) {
      sql += ' AND fp.payment_status = ?';
      params.push(status);
    }

    if (walletId) {
      sql += ' AND fp.wallet_id = ?';
      params.push(parseInt(walletId, 10));
    }

    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    sql += ` ORDER BY fp.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [payments] = await connection.execute(sql, params);

    // Get total count for pagination
    let countSql = `
      SELECT COUNT(*) as total
      FROM fee_payments fp
      JOIN students s ON fp.student_id = s.id
      WHERE s.school_id = ?
    `;
    
    const countParams = [schoolId];
    if (studentId) {
      countSql += ' AND fp.student_id = ?';
      countParams.push(parseInt(studentId, 10));
    }
    if (termId) {
      countSql += ' AND fp.term_id = ?';
      countParams.push(parseInt(termId, 10));
    }
    if (status) {
      countSql += ' AND fp.payment_status = ?';
      countParams.push(status);
    }
    if (walletId) {
      countSql += ' AND fp.wallet_id = ?';
      countParams.push(parseInt(walletId, 10));
    }

    const [countResult] = await connection.execute(countSql, countParams);

    return NextResponse.json({
      success: true,
      data: payments,
      pagination: {
        total: countResult[0].total,
        limit,
        offset,
        hasMore: offset + limit < countResult[0].total
      }
    });

  } catch (error: any) {
    console.error('Payments fetch error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch payments',
      data: []
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { 
      student_id,
      term_id,
      wallet_id,
      items, // Array of { student_fee_item_id, amount }
      amount,
      discount_applied = 0,
      tax_amount = 0,
      method,
      paid_by,
      payer_contact,
      reference,
      gateway_reference
    } = body;

    if (!student_id || !term_id || !wallet_id || !amount || !method || !items?.length) {
      return NextResponse.json({
        success: false,
        message: 'Missing required payment fields'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // 1. Validate student fee items and calculate expected amount
      const feeItemIds = items.map((item: any) => item.student_fee_item_id);
      const [feeItems] = await connection.execute(`
        SELECT 
          sfi.id,
          sfi.student_id,
          sfi.term_id,
          sfi.item,
          sfi.amount,
          sfi.discount,
          sfi.waived,
          sfi.paid,
          sfi.balance
        FROM student_fee_items sfi
        WHERE sfi.id IN (${feeItemIds.map(() => '?').join(',')}) 
          AND sfi.student_id = ? 
          AND sfi.term_id = ?
      `, [...feeItemIds, student_id, term_id]);

      if (feeItems.length !== items.length) {
        throw new Error('Invalid fee items provided');
      }

      // 2. Generate receipt number
      const [receiptCount] = await connection.execute(
        'SELECT COUNT(*) as count FROM receipts WHERE school_id = ? AND DATE(generated_at) = CURDATE()',
        [schoolId]
      );
      
      const receiptNo = `R-${new Date().getFullYear()}-${String(receiptCount[0].count + 1).padStart(6, '0')}`;

      // 3. Create payment record
      const [paymentResult] = await connection.execute(`
        INSERT INTO fee_payments (
          student_id, term_id, wallet_id, amount, discount_applied, tax_amount,
          method, paid_by, payer_contact, reference, gateway_reference, receipt_no, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')
      `, [
        student_id, term_id, wallet_id, amount, discount_applied, tax_amount,
        method, paid_by, payer_contact, reference, gateway_reference, receiptNo
      ]);

      const paymentId = paymentResult.insertId;

      // 4. Update student fee items and their statuses
      const updatedFeeItemIds: number[] = [];
      for (const item of items) {
        await connection.execute(`
          UPDATE student_fee_items 
          SET paid = paid + ?
          WHERE id = ?
        `, [item.amount, item.student_fee_item_id]);
        
        updatedFeeItemIds.push(item.student_fee_item_id);
      }

      // 5. Create ledger entry
      const [incomeCategory] = await connection.execute(`
        SELECT id FROM finance_categories 
        WHERE (school_id = ? OR school_id IS NULL) AND type = 'income' AND name = 'Tuition Fees'
        LIMIT 1
      `, [schoolId]);

      await connection.execute(`
        INSERT INTO ledger (
          schoolId, wallet_id, category_id, tx_type, amount, 
          reference, description, student_id, created_by
        ) VALUES (?, ?, ?, 'credit', ?, ?, ?, ?, ?)
      `, [
        schoolId, wallet_id, incomeCategory[0]?.id || 1, amount,
        reference || receiptNo, `Payment from ${paid_by} for ${feeItems.map((f: any) => f.item).join(', ')}`,
        student_id, session.userId // from authenticated session
      ]);

      // 6. Create receipt record
      await connection.execute(`
        INSERT INTO receipts (school_id, payment_id, receipt_no, generated_by, metadata)
        VALUES (?, ?, ?, ?, ?)
      `, [
        schoolId, paymentId, receiptNo, session.userId,
        JSON.stringify({
          items: feeItems.map((f: any) => ({ item: f.item, amount: f.amount })),
          payment_method: method,
          paid_by,
          payer_contact
        })
      ]);

      // 7. Create reconciliation record
      await connection.execute(`
        INSERT INTO payment_reconciliations (school_id, payment_id, status)
        VALUES (?, ?, 'pending')
      `, [schoolId, paymentId]);

      // 8. Log finance action
      await connection.execute(`
        INSERT INTO finance_actions (school_id, actor_user_id, action, entity_type, entity_id, metadata)
        VALUES (?, ?, 'create_payment', 'payment', ?, ?)
      `, [
        schoolId, session.userId, paymentId,
        JSON.stringify({ amount, method, student_id, items_count: items.length })
      ]);

      await connection.commit();

      // Update fee item statuses after transaction commits
      await batchUpdateFeeItemStatuses(updatedFeeItemIds);

      // TODO: Trigger PDF generation and notifications

      return NextResponse.json({
        success: true,
        payment_id: paymentId,
        receipt: {
          receipt_no: receiptNo,
          download_url: `/api/finance/payments/${paymentId}/receipt`
        },
        message: 'Payment processed successfully'
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error: any) {
    console.error('Payment creation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to process payment'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
