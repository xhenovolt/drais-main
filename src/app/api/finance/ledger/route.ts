import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';

/**
 * GET /api/finance/ledger
 *   ?wallet_id=&student_id=&staff_id=&tx_type=&category_id=&date_from=&date_to=&page=&per_page=
 *
 * Returns ledger entries scoped to the session's school_id, ordered
 * newest-first, with running balance derivable client-side.
 *
 * POST /api/finance/ledger
 *   body: { wallet_id, category_id, tx_type, amount, reference,
 *           description, student_id, staff_id }
 *   Records a manual ledger entry. Both INSERTs use the authenticated
 *   session's school_id and user_id (no hard-coded tenants).
 */

const num = (v: string | null, dflt: number, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  if (v == null) return dflt;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
};

export async function GET(req: NextRequest) {
  // Multi-tenant + RBAC. The previous implementation had NEITHER —
  // anyone with the URL could read every school's ledger.
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'finance.view', session.isSuperAdmin);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const wallet_id   = searchParams.get('wallet_id');
  const student_id  = searchParams.get('student_id');
  const staff_id    = searchParams.get('staff_id');
  const tx_type     = searchParams.get('tx_type');
  const category_id = searchParams.get('category_id');
  const date_from   = searchParams.get('date_from');
  const date_to     = searchParams.get('date_to');

  const page     = num(searchParams.get('page'),      1,  1);
  const per_page = num(searchParams.get('per_page'), 25,  1, 1000);
  const offset   = (page - 1) * per_page;

  const where: string[] = ['l.school_id = ?'];
  const params: any[]   = [session.schoolId];

  if (wallet_id)   { where.push('l.wallet_id = ?');   params.push(wallet_id); }
  if (student_id)  { where.push('l.student_id = ?');  params.push(student_id); }
  if (staff_id)    { where.push('l.staff_id = ?');    params.push(staff_id); }
  if (tx_type)     { where.push('l.tx_type = ?');     params.push(tx_type); }
  if (category_id) { where.push('l.category_id = ?'); params.push(category_id); }
  if (date_from)   { where.push('l.created_at >= ?'); params.push(date_from); }
  if (date_to)     { where.push('l.created_at <  DATE_ADD(?, INTERVAL 1 DAY)'); params.push(date_to); }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const conn = await getConnection();
  try {
    const [rows] = await conn.execute(
      `SELECT
         l.id, l.wallet_id, w.name AS wallet_name,
         l.category_id, fc.name AS category_name,
         l.tx_type, l.amount,
         l.reference, l.description,
         l.student_id,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pe.first_name, pe.last_name)), ''),
                  CASE WHEN l.student_id IS NOT NULL THEN CONCAT('Student #', l.student_id) ELSE NULL END
         ) AS student_name,
         l.staff_id,
         COALESCE(NULLIF(TRIM(CONCAT_WS(' ', pst.first_name, pst.last_name)), ''),
                  CASE WHEN l.staff_id IS NOT NULL THEN CONCAT('Staff #', l.staff_id) ELSE NULL END
         ) AS staff_name,
         l.created_by, l.created_at
       FROM ledger l
       JOIN wallets w        ON w.id = l.wallet_id
       LEFT JOIN finance_categories fc ON fc.id = l.category_id
       LEFT JOIN students  st  ON st.id  = l.student_id
       LEFT JOIN people    pe  ON pe.id  = st.person_id
       LEFT JOIN staff     stf ON stf.id = l.staff_id
       LEFT JOIN people    pst ON pst.id = stf.person_id
       ${whereSql}
       ORDER BY l.id DESC
       LIMIT ${per_page} OFFSET ${offset}`,
      params,
    );

    const [[countRow]]: any = await conn.execute(
      `SELECT COUNT(*) AS total FROM ledger l ${whereSql}`,
      params,
    );

    // Aggregate totals for this filter set (debits/credits).
    const [[totals]]: any = await conn.execute(
      `SELECT
         SUM(CASE WHEN l.tx_type = 'credit' THEN l.amount ELSE 0 END) AS total_credit,
         SUM(CASE WHEN l.tx_type = 'debit'  THEN l.amount ELSE 0 END) AS total_debit
       FROM ledger l ${whereSql}`,
      params,
    );

    const totalCredit = Number(totals?.total_credit ?? 0) || 0;
    const totalDebit  = Number(totals?.total_debit  ?? 0) || 0;

    return NextResponse.json({
      success: true,
      data:    rows,
      total:   Number(countRow.total) || 0,
      page,
      per_page,
      totals: {
        credit:  totalCredit,
        debit:   totalDebit,
        balance: totalCredit - totalDebit,
      },
    });
  } catch (error: any) {
    console.error('Ledger GET error:', error);
    return NextResponse.json({ success: false, error: 'Failed to load ledger' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const { wallet_id, category_id, tx_type, amount, reference, description, student_id, staff_id } = body;
  if (!wallet_id || !category_id || !tx_type || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!['credit', 'debit'].includes(String(tx_type))) {
    return NextResponse.json({ error: "tx_type must be 'credit' or 'debit'" }, { status: 400 });
  }
  const amt = Number(amount);
  if (!Number.isFinite(amt) || amt <= 0) {
    return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
  }

  const conn = await getConnection();
  try {
    // Verify the wallet belongs to this school (prevents cross-tenant writes).
    const [walletRows]: any = await conn.execute(
      `SELECT id FROM wallets WHERE id = ? AND school_id = ?`,
      [wallet_id, session.schoolId],
    );
    if (!walletRows.length) {
      return NextResponse.json({ error: 'Wallet not found in this school' }, { status: 404 });
    }

    await conn.beginTransaction();

    const [result]: any = await conn.execute(
      `INSERT INTO ledger
         (school_id, wallet_id, category_id, tx_type, amount,
          reference, description, student_id, staff_id, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        session.schoolId, wallet_id, category_id, tx_type, amt,
        reference || null, description || null,
        student_id || null, staff_id || null,
        session.userId,
      ],
    );

    // Audit row — uses the real session, not hard-coded (1, 1).
    await conn.execute(
      `INSERT INTO finance_actions
         (school_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'manual_ledger_entry', 'ledger', ?, ?)`,
      [session.schoolId, session.userId, result.insertId,
       JSON.stringify({ amount: amt, tx_type, reference: reference || null })],
    );

    await conn.commit();

    return NextResponse.json({
      success: true,
      message: 'Ledger entry created successfully',
      data:    { id: result.insertId },
    });
  } catch (error: any) {
    try { await conn.rollback(); } catch {}
    console.error('Ledger POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create ledger entry' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
