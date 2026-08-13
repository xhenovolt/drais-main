import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, checkPermission } from '@/lib/rbac';
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
    // school_id derived from session below
    const branchId = searchParams.get('branch_id');

    connection = await getConnection();

    let sql = `
      SELECT 
        w.id,
        w.name,
        w.location_type AS method,
        w.currency,
        w.opening_balance,
        w.balance     AS current_balance,
        (w.status = 'active') AS is_active,
        w.account_number,
        w.bank_name,
        w.branch_name,
        w.provider,
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
    await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin);
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
      // The opening balance is the money the wallet STARTS with, so it has to
      // land in `balance` too. This previously inserted a literal 0 and threw
      // the supplied opening balance away: the wallet showed 0 spendable, and
      // every salary payment was refused with "Insufficient wallet balance"
      // even though the school had recorded a float. Both columns exist; both
      // are now written.
      const opening = Number(body?.opening_balance ?? 0);
      if (!Number.isFinite(opening) || opening < 0) {
        return NextResponse.json({ success: false, error: 'Opening balance must be zero or more' }, { status: 400 });
      }

      const [walletResult]: any = await connection.execute(
        `INSERT INTO wallets
           (school_id, name, currency, balance, opening_balance, status,
            location_type, provider, account_number, bank_name, branch_name)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)`,
        [
          schoolId, name, currency, opening, opening,
          body?.location_type || body?.method || 'cash',
          body?.provider || null,
          body?.account_number || null,
          body?.bank_name || null,
          body?.branch_name || null,
        ]
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

/**
 * PUT /api/finance/wallets — correct a wallet.
 *
 * There was no update path at all: a wallet created with the wrong opening
 * balance (which, before today, was every wallet — POST discarded it and wrote
 * 0) could never be fixed, so payroll stayed blocked with no way out.
 *
 * Changing the opening balance adjusts the CURRENT balance by the same
 * difference rather than overwriting it. Setting an opening balance of
 * 5,000,000 on a wallet that has already paid out 200,000 must leave
 * 4,800,000 spendable, not 5,000,000 — overwriting would silently re-credit
 * money that has already left the school.
 */
export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const denied = await checkModule(session.schoolId, 'finance');
    if (denied) return denied;
    const permDenied = await checkPermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin);
    if (permDenied) return permDenied;

    const schoolId = session.schoolId;
    const body = await req.json().catch(() => null);
    const id = Number(body?.id);
    if (!Number.isFinite(id)) {
      return NextResponse.json({ success: false, error: 'Wallet id is required' }, { status: 400 });
    }

    connection = await getConnection();

    // Scoped read — a wallet id from another school simply isn't found.
    const [rows]: any = await connection.execute(
      `SELECT id, balance, opening_balance FROM wallets WHERE id = ? AND school_id = ? LIMIT 1`,
      [id, schoolId],
    );
    if (!rows.length) {
      return NextResponse.json({ success: false, error: 'Wallet not found' }, { status: 404 });
    }
    const current = rows[0];

    const sets: string[] = [];
    const args: any[] = [];

    if (body.name !== undefined) {
      const nm = String(body.name).trim().slice(0, 100);
      if (!nm) return NextResponse.json({ success: false, error: 'Wallet name cannot be empty' }, { status: 400 });
      sets.push('name = ?'); args.push(nm);
    }
    if (body.opening_balance !== undefined) {
      const next = Number(body.opening_balance);
      if (!Number.isFinite(next) || next < 0) {
        return NextResponse.json({ success: false, error: 'Opening balance must be zero or more' }, { status: 400 });
      }
      const delta = next - Number(current.opening_balance ?? 0);
      const newBalance = Number(current.balance ?? 0) + delta;
      if (newBalance < 0) {
        return NextResponse.json({
          success: false,
          error: `That opening balance would leave the wallet at ${newBalance.toFixed(2)} — less than what has already been paid out of it.`,
        }, { status: 400 });
      }
      sets.push('opening_balance = ?', 'balance = ?');
      args.push(next, newBalance);
    }
    for (const [key, col] of [['location_type', 'location_type'], ['provider', 'provider'],
                              ['account_number', 'account_number'], ['bank_name', 'bank_name'],
                              ['branch_name', 'branch_name'], ['currency', 'currency']] as const) {
      if (body[key] !== undefined) { sets.push(`${col} = ?`); args.push(body[key] || null); }
    }
    if (body.is_active !== undefined) { sets.push('status = ?'); args.push(body.is_active ? 'active' : 'inactive'); }

    if (!sets.length) return NextResponse.json({ success: false, error: 'Nothing to change' }, { status: 400 });

    args.push(id, schoolId);
    await connection.execute(
      `UPDATE wallets SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?`,
      args,
    );

    const [after]: any = await connection.execute(
      `SELECT id, name, currency, balance, opening_balance, status FROM wallets WHERE id = ? AND school_id = ?`,
      [id, schoolId],
    );
    return NextResponse.json({ success: true, message: 'Wallet updated', data: after[0] });
  } catch (e: any) {
    console.error('[wallets] update failed:', e);
    return NextResponse.json({ success: false, error: e?.message || 'Failed to update wallet' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
