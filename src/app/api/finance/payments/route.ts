import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { batchUpdateFeeItemStatuses } from '@/lib/services/FeeService';
import { recordPayment } from '@/lib/services/FinanceLedger';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { checkModule } from '@/lib/auth/requireModule';

export async function GET(req: NextRequest) {
  let connection;

  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('student_id');
    const walletId = searchParams.get('wallet_id'); // maps to finance_payments.account_id
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    connection = await getConnection();

    // CANONICAL source: finance_payments (+ student_ledger for term, receipts for
    // the receipt, payment_reconciliations for status). The legacy fee_payments
    // table is no longer written; all payments flow through recordPayment().
    let sql = `
      SELECT
        fp.id,
        fp.student_id,
        fp.amount,
        fp.account_id AS wallet_id,
        fp.method,
        fp.paid_by,
        fp.payer_contact,
        fp.reference,
        fp.receipt_no,
        'completed' AS status,
        fp.created_at,
        CONCAT(p.first_name, ' ', p.last_name) AS student_name,
        s.admission_no,
        c.name AS class_name,
        t.name AS term_name,
        fa.name AS wallet_name,
        COALESCE(sch.currency, 'UGX') AS currency,
        r.receipt_no AS receipt_number,
        r.file_url AS receipt_url,
        pr.status AS reconciliation_status
      FROM finance_payments fp
      JOIN students s ON fp.student_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes c ON e.class_id = c.id
      LEFT JOIN student_ledger sl ON sl.payment_id = fp.id AND sl.type = 'credit'
      LEFT JOIN terms t ON sl.term_id = t.id
      LEFT JOIN wallets fa ON fp.account_id = fa.id
      LEFT JOIN schools sch ON fp.school_id = sch.id
      LEFT JOIN receipts r ON fp.id = r.payment_id
      LEFT JOIN payment_reconciliations pr ON fp.id = pr.payment_id
      WHERE fp.school_id = ?
    `;

    const params: any[] = [schoolId];
    if (studentId) { sql += ' AND fp.student_id = ?'; params.push(parseInt(studentId, 10)); }
    if (walletId) { sql += ' AND fp.account_id = ?'; params.push(parseInt(walletId, 10)); }

    const safeLimit = Math.max(1, Math.min(1000, Number(limit) || 50));
    const safeOffset = Math.max(0, Number(offset) || 0);
    sql += ` ORDER BY fp.created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`;

    const [payments] = await connection.execute(sql, params);

    let countSql = `SELECT COUNT(*) AS total FROM finance_payments fp WHERE fp.school_id = ?`;
    const countParams: any[] = [schoolId];
    if (studentId) { countSql += ' AND fp.student_id = ?'; countParams.push(parseInt(studentId, 10)); }
    if (walletId) { countSql += ' AND fp.account_id = ?'; countParams.push(parseInt(walletId, 10)); }

    const [countResult] = await connection.execute(countSql, countParams);

    return NextResponse.json({
      success: true,
      data: payments,
      pagination: {
        total: countResult[0].total,
        limit,
        offset,
        hasMore: offset + limit < countResult[0].total,
      },
    });
  } catch (error: any) {
    console.error('Payments fetch error:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch payments', data: [] }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin);
    const schoolId = session.schoolId;

    const body = await req.json();
    const {
      student_id,
      term_id,
      wallet_id,
      items, // optional Array of { student_fee_item_id, amount }
      amount,
      discount_applied = 0,
      tax_amount = 0,
      method,
      paid_by,
      payer_contact,
      reference,
    } = body;

    if (!student_id || !amount || !method) {
      return NextResponse.json({
        success: false,
        message: 'Missing required payment fields (student_id, amount, method)',
      }, { status: 400 });
    }

    // Trust guard: when item allocations are supplied they must sum to the amount.
    if (items?.length) {
      const itemsSum = items.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
      if (Math.abs(itemsSum - Number(amount)) > 0.01) {
        return NextResponse.json({
          success: false,
          message: `Payment amount (${amount}) must equal the sum of item allocations (${itemsSum})`,
        }, { status: 400 });
      }

      // Payment-channel enforcement: a fee item that requires a specific channel
      // (e.g. tuition via school code) rejects a mismatched method. student_fee_items
      // stores the item NAME, matched to fee_items.payment_channel for this school.
      const { query } = await import('@/lib/db');
      const { isChannelAllowed } = await import('@/lib/finance/feeRules');
      const ids = items.map((i: any) => Number(i.student_fee_item_id)).filter(Boolean);
      if (ids.length) {
        const chRows = (await query(
          `SELECT sfi.id, fi.payment_channel
             FROM student_fee_items sfi
             JOIN fee_items fi ON fi.name = sfi.item AND fi.school_id = ?
            WHERE sfi.id IN (${ids.map(() => '?').join(',')})`,
          [session.schoolId, ...ids],
        )) as any[];
        const chById = new Map(chRows.map((r) => [Number(r.id), r.payment_channel]));
        for (const it of items) {
          const verdict = isChannelAllowed(chById.get(Number(it.student_fee_item_id)), method);
          if (!verdict.ok) {
            return NextResponse.json({ success: false, message: verdict.reason }, { status: 400 });
          }
        }
      }
    }

    // finance_payments.method is an enum — clamp anything unexpected to 'other'.
    const VALID_METHODS = ['cash', 'bank_transfer', 'mpesa', 'airtel', 'card', 'cheque', 'other'];
    const normMethod = VALID_METHODS.includes(method) ? method : 'other';

    // Delegate to the single canonical (ledger-based) payment writer:
    // finance_payments + student_ledger credit + receipt + reconciliation
    // + optional per-item allocation + audit, all transactional, then SMS.
    const result = await recordPayment({
      studentId: Number(student_id),
      schoolId,
      amount: Number(amount),
      method: normMethod,
      accountId: wallet_id ? Number(wallet_id) : undefined,
      reference,
      paidBy: paid_by,
      payerContact: payer_contact,
      termId: term_id ? Number(term_id) : undefined,
      items: items?.length ? items : undefined,
      discountApplied: Number(discount_applied) || 0,
      taxAmount: Number(tax_amount) || 0,
      createdBy: session.userId,
    });

    if (items?.length) {
      await batchUpdateFeeItemStatuses(items.map((i: any) => i.student_fee_item_id));
    }

    return NextResponse.json({
      success: true,
      payment_id: result.paymentId,
      receipt: {
        receipt_no: result.receiptNo,
        download_url: `/api/finance/payments/${result.paymentId}/receipt`,
      },
      message: 'Payment processed successfully',
    });
  } catch (error: any) {
    console.error('Payment creation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to process payment',
    }, { status: 500 });
  }
}
