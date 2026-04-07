import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
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
        'cash'        AS method,
        w.currency,
        0             AS opening_balance,
        w.balance     AS current_balance,
        (w.status = 'active') AS is_active,
        NULL          AS account_number,
        NULL          AS bank_name,
        NULL          AS branch_name,
        0             AS transaction_count,
        0             AS total_credits,
        0             AS total_debits,
        w.created_at
      FROM wallets w
      WHERE w.school_id = ?
    `;

    const params = [schoolId];

    if (branchId) {
      /* branch column not in current schema — ignore */
    }

    sql += ' ORDER BY w.name ASC';

    const [wallets] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: wallets
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
    const { name, currency = 'UGX' } = body;

    if (!name) {
      return NextResponse.json({
        success: false,
        error: 'Wallet name is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    try {
      // Create wallet using actual schema
      const [walletResult]: any = await connection.execute(
        `INSERT INTO wallets (school_id, name, currency, balance, status) VALUES (?, ?, ?, 0, 'active')`,
        [schoolId, name, currency]
      );

      const walletId = (walletResult as any).insertId;

      return NextResponse.json({
        success: true,
        message: 'Wallet created successfully',
        data: { id: walletId }
      });

    } catch (error) {
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
