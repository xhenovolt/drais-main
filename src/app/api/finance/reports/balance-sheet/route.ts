import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
// GET /api/finance/reports/balance-sheet
// Get balance sheet report
export async function GET(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    // Financial statements have their own permission, but `finance.view` is the
    // legacy module-wide code that existing roles actually hold. Requiring ONLY
    // the granular code 403s every current user, because expandPermissionChain
    // maps 'finance.reports.view' to
    //   [finance.reports.view, finance.reports.*, finance.*, *]
    // which does not include the legacy 'finance.view'.
    //
    // So accept EITHER: schools can adopt the finer permission when they choose
    // without losing access today. Drop the fallback once `finance.reports.view`
    // has been granted everywhere.
    try {
      await requirePermission(session.userId, session.schoolId, 'finance.reports.view', session.isSuperAdmin);
    } catch {
      await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const asOfDate = searchParams.get('as_of_date') || new Date().toISOString().split('T')[0];
    
    connection = await getConnection();
    
    // Get all wallets with balances
    const [wallets] = await connection.execute(`
      SELECT 
        w.id,
        w.name,
        w.method,
        w.account_number,
        w.bank_name,
        w.currency,
        w.opening_balance,
        w.is_active
      FROM wallets w
      WHERE w.school_id = ? AND w.is_active = 1 AND (w.deleted_at IS NULL OR w.deleted_at = '')
      ORDER BY w.name
    `, [schoolId]);
    
    // Calculate wallet balances
    const walletBalances = await Promise.all((wallets as any[]).map(async (wallet: any) => {
      const [credits] = await connection.execute(`
        SELECT COALESCE(SUM(amount), 0) as total_credits
        FROM ledger 
        WHERE wallet_id = ? AND tx_type = 'credit' AND status = 'approved'
          AND transaction_date <= ?
      `, [wallet.id, asOfDate]);
      
      const [debits] = await connection.execute(`
        SELECT COALESCE(SUM(amount), 0) as total_debits
        FROM ledger 
        WHERE wallet_id = ? AND tx_type = 'debit' AND status = 'approved'
          AND transaction_date <= ?
      `, [wallet.id, asOfDate]);
      
      return {
        ...wallet,
        total_credits: parseFloat((credits[0] as any)?.total_credits || 0),
        total_debits: parseFloat((debits[0] as any)?.total_debits || 0),
        current_balance: wallet.opening_balance + parseFloat((credits[0] as any)?.total_credits || 0) - parseFloat((debits[0] as any)?.total_debits || 0)
      };
    }));
    
    // ── Accounts receivable (outstanding fees) ───────────────────────────────
    // SECURITY (2026-08): this query previously had NO tenant filter, so one
    // school's balance sheet reported EVERY school's outstanding fees as its own
    // receivables — inflating assets by an arbitrary amount.
    //
    // `student_fee_items` has no school_id of its own, so it must be scoped by
    // joining through `students` (the same pattern the parent-portal gate uses).
    const [receivables] = await connection.execute(`
      SELECT
        COUNT(DISTINCT sfi.student_id) as total_students_with_balance,
        COALESCE(SUM(sfi.balance), 0) as total_outstanding,
        COALESCE(SUM(CASE WHEN sfi.balance > 0 AND sfi.paid > 0 THEN sfi.balance ELSE 0 END), 0) as partial_outstanding,
        COALESCE(SUM(CASE WHEN sfi.paid = 0 THEN sfi.balance ELSE 0 END), 0) as full_outstanding
      FROM student_fee_items sfi
      JOIN students s ON s.id = sfi.student_id
      WHERE s.school_id = ?
        AND s.deleted_at IS NULL
        AND sfi.balance > 0
    `, [schoolId]);
    
    // Get accounts payable (pending expenditures)
    const [payables] = await connection.execute(`
      SELECT 
        COUNT(*) as total_pending,
        COALESCE(SUM(amount), 0) as total_pending_amount
      FROM expenditures 
      WHERE school_id = ? AND status = 'pending' AND (deleted_at IS NULL OR deleted_at = '')
    `, [schoolId]);
    
    // Get student deposits/advances
    const [deposits] = await connection.execute(`
      SELECT 
        COALESCE(SUM(amount), 0) as total_deposits
      FROM ledger 
      WHERE school_id = ? AND category_id IN (
        SELECT id FROM finance_categories WHERE name = 'Student Deposits'
      ) AND status = 'approved'
    `, [schoolId]);
    
    // Calculate totals
    const totalCash = walletBalances.reduce((sum: number, w: any) => sum + w.current_balance, 0);
    const totalReceivables = parseFloat((receivables[0] as any)?.total_outstanding || 0);
    const totalPayables = parseFloat((payables[0] as any)?.total_pending_amount || 0);
    const totalDeposits = parseFloat((deposits[0] as any)?.total_deposits || 0);
    
    // Assets = Cash + Receivables
    const totalAssets = totalCash + totalReceivables;
    
    // Liabilities = Payables + Deposits
    const totalLiabilities = totalPayables + totalDeposits;
    
    // Net Assets = Assets - Liabilities
    const netAssets = totalAssets - totalLiabilities;
    
    return NextResponse.json({
      success: true,
      data: {
        as_of_date: asOfDate,
        assets: {
          cash_and_equivalents: {
            wallets: walletBalances,
            total: totalCash
          },
          accounts_receivable: {
            description: 'Outstanding student fees',
            total_students: (receivables[0] as any)?.total_students_with_balance,
            full_outstanding: parseFloat((receivables[0] as any)?.full_outstanding || 0),
            partial_outstanding: parseFloat((receivables[0] as any)?.partial_outstanding || 0),
            total: totalReceivables
          },
          total_assets: totalAssets
        },
        liabilities: {
          accounts_payable: {
            description: 'Pending expenditures',
            count: (payables[0] as any)?.total_pending,
            total: totalPayables
          },
          student_deposits: {
            description: 'Advance payments from students',
            total: totalDeposits
          },
          total_liabilities: totalLiabilities
        },
        equity: {
          net_assets: netAssets,
          total_equity: netAssets
        },
        balance_check: {
          assets_equals_equity_plus_liabilities: totalAssets === (totalLiabilities + netAssets)
        }
      }
    });
    
  } catch (error: any) {
    console.error('Balance sheet error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to generate balance sheet'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
