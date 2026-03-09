import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
// GET /api/finance/reports/income-statement
// Get income statement report
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
    const startDate = searchParams.get('start_date');
    const endDate = searchParams.get('end_date');
    const academicYear = searchParams.get('academic_year');
    
    connection = await getConnection();
    
    // Get income categories
    const [incomeCategories] = await connection.execute(`
      SELECT id, name, color, icon
      FROM finance_categories 
      WHERE (school_id = ? OR school_id IS NULL) 
        AND category_type = 'income' 
        AND is_active = 1
      ORDER BY name
    `, [schoolId]);
    
    // Get expense categories
    const [expenseCategories] = await connection.execute(`
      SELECT id, name, color, icon
      FROM finance_categories 
      WHERE (school_id = ? OR school_id IS NULL) 
        AND category_type = 'expense' 
        AND is_active = 1
      ORDER BY name
    `, [schoolId]);
    
    // Get income transactions
    let incomeSql = `
      SELECT 
        fc.id as category_id,
        fc.name as category_name,
        COALESCE(SUM(l.amount), 0) as total_amount,
        COUNT(*) as transaction_count
      FROM finance_categories fc
      LEFT JOIN ledger l ON fc.id = l.category_id 
        AND l.status = 'approved'
        AND (l.deleted_at IS NULL OR l.deleted_at = '')
        ${startDate ? 'AND l.transaction_date >= ?' : ''}
        ${endDate ? 'AND l.transaction_date <= ?' : ''}
      WHERE fc.category_type = 'income' 
        AND (fc.school_id = ? OR fc.school_id IS NULL)
      GROUP BY fc.id, fc.name
      ORDER BY total_amount DESC
    `;
    
    const incomeParams: any[] = [];
    if (startDate) incomeParams.push(startDate);
    if (endDate) incomeParams.push(endDate);
    incomeParams.push(schoolId);
    
    const [incomeTransactions] = await connection.execute(incomeSql, incomeParams);
    
    // Get expense transactions
    let expenseSql = `
      SELECT 
        fc.id as category_id,
        fc.name as category_name,
        COALESCE(SUM(l.amount), 0) as total_amount,
        COUNT(*) as transaction_count
      FROM finance_categories fc
      LEFT JOIN ledger l ON fc.id = l.category_id 
        AND l.status = 'approved'
        AND (l.deleted_at IS NULL OR l.deleted_at = '')
        ${startDate ? 'AND l.transaction_date >= ?' : ''}
        ${endDate ? 'AND l.transaction_date <= ?' : ''}
      WHERE fc.category_type = 'expense' 
        AND (fc.school_id = ? OR fc.school_id IS NULL)
      GROUP BY fc.id, fc.name
      ORDER BY total_amount DESC
    `;
    
    const expenseParams: any[] = [];
    if (startDate) expenseParams.push(startDate);
    if (endDate) expenseParams.push(endDate);
    expenseParams.push(schoolId);
    
    const [expenseTransactions] = await connection.execute(expenseSql, expenseParams);
    
    // Calculate totals
    const totalIncome = (incomeTransactions as any[]).reduce((sum, item) => sum + parseFloat(item.total_amount || 0), 0);
    const totalExpenses = (expenseTransactions as any[]).reduce((sum, item) => sum + parseFloat(item.total_amount || 0), 0);
    const netIncome = totalIncome - totalExpenses;
    
    // Get fee collections summary
    const [feeSummary] = await connection.execute(`
      SELECT 
        COALESCE(SUM(fp.amount), 0) as total_collected,
        COUNT(*) as total_transactions,
        COALESCE(SUM(CASE WHEN fp.method = 'cash' THEN fp.amount ELSE 0 END), 0) as cash_collected,
        COALESCE(SUM(CASE WHEN fp.method = 'mpesa' THEN fp.amount ELSE 0 END), 0) as mpesa_collected,
        COALESCE(SUM(CASE WHEN fp.method = 'bank_transfer' THEN fp.amount ELSE 0 END), 0) as bank_collected
      FROM fee_payments fp
      WHERE fp.status = 'completed'
        AND DATE(fp.created_at) BETWEEN ? AND ?
    `, [startDate || '2020-01-01', endDate || new Date().toISOString().split('T')[0]]);
    
    // Get expenditure summary
    const [expenditureSummary] = await connection.execute(`
      SELECT 
        COALESCE(SUM(e.amount), 0) as total_expenditure,
        COUNT(*) as total_transactions,
        COALESCE(SUM(CASE WHEN e.status = 'approved' THEN e.amount ELSE 0 END), 0) as approved_expenditure
      FROM expenditures e
      WHERE e.school_id = ? AND (e.deleted_at IS NULL OR e.deleted_at = '')
        AND e.expense_date BETWEEN ? AND ?
    `, [schoolId, startDate || '2020-01-01', endDate || new Date().toISOString().split('T')[0]]);
    
    return NextResponse.json({
      success: true,
      data: {
        report_period: {
          start_date: startDate,
          end_date: endDate,
          academic_year: academicYear
        },
        income: {
          categories: incomeCategories,
          transactions: incomeTransactions,
          total: totalIncome
        },
        expenses: {
          categories: expenseCategories,
          transactions: expenseTransactions,
          total: totalExpenses
        },
        summary: {
          total_income: totalIncome,
          total_expenses: totalExpenses,
          net_income: netIncome,
          profit_margin: totalIncome > 0 ? ((netIncome / totalIncome) * 100).toFixed(2) : 0
        },
        fee_collections: feeSummary[0] || {},
        expenditures: expenditureSummary[0] || {}
      }
    });
    
  } catch (error: any) {
    console.error('Income statement error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to generate income statement'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
