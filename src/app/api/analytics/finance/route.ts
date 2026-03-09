import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const termId = searchParams.get('term_id');
    
    const connection = await getConnection();
    
    // Fee collection summary
    const feeCollectionSummary = await connection.execute(`
      SELECT 
        c.name as class_name,
        COUNT(DISTINCT s.id) as total_students,
        COALESCE(SUM(sfi.amount), 0) as total_expected,
        COALESCE(SUM(sfi.paid), 0) as total_collected,
        COALESCE(SUM(sfi.balance), 0) as total_outstanding,
        ROUND(COALESCE(SUM(sfi.paid) / NULLIF(SUM(sfi.amount), 0) * 100, 0), 2) as avg_payment_rate,
        COUNT(CASE WHEN sfi.balance = 0 THEN 1 END) as fully_paid_students,
        COUNT(CASE WHEN sfi.paid = 0 THEN 1 END) as unpaid_students
      FROM students s
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      LEFT JOIN student_fee_items sfi ON s.id = sfi.student_id
        ${termId ? 'AND sfi.term_id = ?' : ''}
      WHERE s.school_id = ? AND s.status = 'active' AND s.deleted_at IS NULL
      GROUP BY c.id, c.name
      ORDER BY total_outstanding DESC
    `, termId ? [termId, schoolId] : [schoolId]);

    // Payment trends over time
    const paymentTrends = await connection.execute(`
      SELECT 
        DATE(fp.created_at) as payment_date,
        SUM(fp.amount) as daily_collection,
        COUNT(fp.id) as transaction_count,
        AVG(fp.amount) as avg_transaction_amount
      FROM fee_payments fp
      JOIN students s ON fp.student_id = s.id AND s.deleted_at IS NULL
      WHERE s.school_id = ? 
      AND fp.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      ${termId ? 'AND fp.term_id = ?' : ''}
      GROUP BY DATE(fp.created_at)
      ORDER BY payment_date DESC
    `, termId ? [schoolId, termId] : [schoolId]);

    // Outstanding balances by student
    const outstandingBalances = await connection.execute(`
      SELECT 
        s.id as student_id,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        s.admission_no,
        c.name as class_name,
        SUM(sfi.balance) as total_balance,
        MAX(fp.created_at) as last_payment_date,
        DATEDIFF(CURDATE(), MAX(fp.created_at)) as days_since_payment
      FROM students s
      JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
      JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      JOIN classes c ON e.class_id = c.id
      JOIN student_fee_items sfi ON s.id = sfi.student_id
        ${termId ? 'AND sfi.term_id = ?' : ''}
      LEFT JOIN fee_payments fp ON s.id = fp.student_id
        ${termId ? 'AND fp.term_id = ?' : ''}
      WHERE s.school_id = ? AND sfi.balance > 0 AND s.deleted_at IS NULL
      GROUP BY s.id, p.first_name, p.last_name, s.admission_no, c.name
      ORDER BY total_balance DESC, days_since_payment DESC
      LIMIT 50
    `, termId ? [termId, termId, schoolId] : [schoolId]);

    // Income vs expenses
    const incomeExpenses = await connection.execute(`
      SELECT 
        fc.name as category_name,
        fc.type as transaction_type,
        SUM(CASE WHEN l.tx_type = 'in' THEN l.amount ELSE 0 END) as income,
        SUM(CASE WHEN l.tx_type = 'out' THEN l.amount ELSE 0 END) as expenses,
        COUNT(l.id) as transaction_count
      FROM ledger l
      JOIN finance_categories fc ON l.category_id = fc.id
      WHERE l.school_id = ?
      AND l.created_at >= DATE_SUB(CURDATE(), INTERVAL 90 DAY)
      GROUP BY fc.id, fc.name, fc.type
      ORDER BY (income + expenses) DESC
    `, [schoolId]);

    // Wallet balances
    const walletBalances = await connection.execute(`
      SELECT 
        w.id as wallet_id,
        w.name as wallet_name,
        w.method,
        w.opening_balance,
        w.opening_balance + COALESCE(SUM(CASE WHEN l.tx_type = 'in' THEN l.amount ELSE -l.amount END), 0) as current_balance,
        COALESCE(SUM(CASE WHEN l.tx_type = 'in' THEN l.amount ELSE 0 END), 0) as total_income,
        COALESCE(SUM(CASE WHEN l.tx_type = 'out' THEN l.amount ELSE 0 END), 0) as total_expenses,
        COUNT(l.id) as transaction_count,
        MAX(l.created_at) as last_transaction_date
      FROM wallets w
      LEFT JOIN ledger l ON w.id = l.wallet_id
      WHERE w.school_id = ?
      GROUP BY w.id, w.name, w.method, w.opening_balance
      ORDER BY current_balance DESC
    `, [schoolId]);

    await connection.end();

    return NextResponse.json({
      success: true,
      data: {
        feeCollectionSummary: feeCollectionSummary[0],
        paymentTrends: paymentTrends[0],
        outstandingBalances: outstandingBalances[0],
        incomeExpenses: incomeExpenses[0],
        walletBalances: walletBalances[0]
      }
    });
  } catch (error: any) {
    console.error('Error fetching finance analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}
