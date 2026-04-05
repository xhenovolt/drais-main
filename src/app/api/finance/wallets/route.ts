import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { computeWalletBalance } from '@/lib/services/FeeService';

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
    const branchId = searchParams.get('branch_id');

    connection = await getConnection();

    let sql = `
      SELECT 
        w.id,
        w.name,
        w.method,
        w.currency,
        w.opening_balance,
        w.current_balance,
        w.is_active,
        w.account_number,
        w.bank_name,
        w.created_at,
        b.name as branch_name,
        COUNT(DISTINCT l.id) as transaction_count,
        COALESCE(SUM(CASE WHEN l.tx_type = 'credit' THEN l.amount ELSE 0 END), 0) as total_credits,
        COALESCE(SUM(CASE WHEN l.tx_type = 'debit' THEN l.amount ELSE 0 END), 0) as total_debits
      FROM wallets w
      LEFT JOIN branches b ON w.branch_id = b.id
      LEFT JOIN ledger l ON w.id = l.wallet_id
      WHERE w.school_id = ? AND (w.updated_at IS NULL OR w.updated_at != 'deleted')
    `;

    const params = [schoolId];

    if (branchId) {
      sql += ' AND w.branch_id = ?';
      params.push(parseInt(branchId, 10));
    }

    sql += ' GROUP BY w.id ORDER BY w.is_active DESC, w.current_balance DESC';

    const [wallets] = await connection.execute(sql, params);

    // Compute current balance dynamically for each wallet
    const walletsWithBalance = await Promise.all(
      (wallets as any[]).map(async (wallet) => {
        const currentBalance = await computeWalletBalance(wallet.id);
        return {
          ...wallet,
          current_balance: currentBalance
        };
      })
    );

    return NextResponse.json({
      success: true,
      data: walletsWithBalance
    });

  } catch (error: any) {
    console.error('Wallets fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch wallets'
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
    const { branch_id = 1,
      name, 
      method, 
      currency = 'UGX',
      opening_balance = 0,
      account_number,
      bank_name } = body;

    if (!name || !method) {
      return NextResponse.json({
        success: false,
        error: 'Wallet name and method are required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Create wallet
      const [walletResult] = await connection.execute(`
        INSERT INTO wallets (school_id, branch_id, name, method, currency, opening_balance, account_number, bank_name)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [schoolId, branch_id, name, method, currency, opening_balance, account_number, bank_name]);

      const walletId = walletResult.insertId;

      // Create opening balance ledger entry if > 0
      if (opening_balance > 0) {
        const [categoryResult] = await connection.execute(`
          SELECT id FROM finance_categories 
          WHERE school_id IS NULL AND name = 'Opening Balance' AND type = 'income'
          LIMIT 1
        `);

        let categoryId = categoryResult[0]?.id;
        
        if (!categoryId) {
          const [newCategoryResult] = await connection.execute(`
            INSERT INTO finance_categories (school_id, type, name) 
            VALUES (?, 'income', 'Opening Balance')
          `, [schoolId]);
          categoryId = newCategoryResult.insertId;
        }

        await connection.execute(`
          INSERT INTO ledger (school_id, wallet_id, category_id, tx_type, amount, reference, description, created_by)
          VALUES (?, ?, ?, 'credit', ?, 'OPENING_BALANCE', 'Opening balance for wallet', ?)
        `, [schoolId, walletId, categoryId, opening_balance, 1]); // TODO: Get user from session
      }

      // Log action
      await connection.execute(`
        INSERT INTO finance_actions (school_id, actor_user_id, action, entity_type, entity_id, metadata)
        VALUES (?, ?, 'create_wallet', 'wallet', ?, ?)
      `, [schoolId, 1, walletId, JSON.stringify({ name, method, opening_balance })]);

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: 'Wallet created successfully',
        data: { id: walletId }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error: any) {
    console.error('Wallet creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create wallet'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
