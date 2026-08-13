import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { checkModule } from '@/lib/auth/requireModule';
import { logAudit } from '@/lib/audit';

/**
 * Salary payments — actual outflows of cash from a wallet to a staff
 * member. POST is transactional: insert the payment row, debit the wallet
 * balance, and record an audit-log entry. Reversing a payment (DELETE)
 * soft-deletes the row and credits the wallet back.
 */
export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const denied = await checkModule(session.schoolId, 'payroll');
    if (denied) return denied;
    await requirePermission(session.userId, session.schoolId, 'payroll.payments.view', session.isSuperAdmin);

    connection = await getConnection();
    const [rows] = await connection.execute(
      `SELECT sp.id, sp.staff_id, sp.wallet_id, sp.amount, sp.method, sp.reference, sp.paid_at,
              CONCAT(p.first_name, ' ', p.last_name) AS staff_name,
              w.name AS wallet_name
       FROM salary_payments sp
       JOIN staff s ON sp.staff_id = s.id
       LEFT JOIN people p ON s.person_id = p.id
       LEFT JOIN wallets w ON sp.wallet_id = w.id
       WHERE sp.school_id = ? AND sp.deleted_at IS NULL
       ORDER BY sp.paid_at DESC`,
      [session.schoolId]
    );
    return NextResponse.json(rows);
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('salary_payments GET:', e);
    return NextResponse.json({ error: 'Failed to load salary payments' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const denied = await checkModule(session.schoolId, 'payroll');
    if (denied) return denied;
    await requirePermission(session.userId, session.schoolId, 'payroll.payments.process', session.isSuperAdmin);

    const { staff_id, wallet_id, amount, method, reference } = await req.json();
    const amt = Number(amount);
    if (!staff_id || !wallet_id || !amt || amt <= 0) {
      return NextResponse.json({ error: 'staff_id, wallet_id, amount (>0) required' }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // Verify staff + wallet both belong to this school
    const [staffRows]: any = await connection.execute(
      `SELECT id FROM staff WHERE id = ? AND school_id = ?`, [staff_id, session.schoolId]
    );
    if (!staffRows.length) { await connection.rollback(); return NextResponse.json({ error: 'Staff not found' }, { status: 404 }); }

    const [walletRows]: any = await connection.execute(
      `SELECT id, balance FROM wallets WHERE id = ? AND school_id = ? FOR UPDATE`,
      [wallet_id, session.schoolId]
    );
    if (!walletRows.length) { await connection.rollback(); return NextResponse.json({ error: 'Wallet not found' }, { status: 404 }); }
    if (Number(walletRows[0].balance) < amt) {
      await connection.rollback();
      return NextResponse.json({ error: 'Insufficient wallet balance' }, { status: 400 });
    }

    const [ins]: any = await connection.execute(
      `INSERT INTO salary_payments (school_id, staff_id, wallet_id, amount, method, reference)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [session.schoolId, staff_id, wallet_id, amt, method || null, reference || null]
    );
    await connection.execute(
      `UPDATE wallets SET balance = balance - ? WHERE id = ?`,
      [amt, wallet_id]
    );
    await connection.commit();

    // Recorded through the canonical logger, into `audit_logs` — the table
    // /admin/audit-logs actually reads. This previously wrote to `audit_log`
    // (singular), a parallel table nothing surfaces: 560 events across ten
    // routes are sitting in it unread. Paying a salary moves real money out
    // of a school's wallet, so it has to appear where someone looks for it.
    //
    // Written AFTER the commit, not inside the transaction. The old placement
    // meant a failure in the audit write rolled back the payment itself —
    // losing the money movement to protect the record of it, which is exactly
    // backwards.
    await logAudit({
      schoolId: session.schoolId,
      userId: session.userId,
      action: 'SALARY_PAID',
      entityType: 'salary_payment',
      entityId: ins.insertId,
      details: { staff_id, wallet_id, amount: amt, method: method || null, reference: reference || null },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
      userAgent: req.headers.get('user-agent'),
    }).catch(() => { /* never fail a completed payment because the log failed */ });
    return NextResponse.json({ success: true, id: ins.insertId }, { status: 201 });
  } catch (e: any) {
    try { if (connection) await connection.rollback(); } catch {}
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('salary_payments POST:', e);
    return NextResponse.json({ error: 'Failed to record salary payment' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

/** PUT only allows editing the descriptive fields (method, reference). Amount and wallet are immutable post-payment — reverse + re-record instead. */
export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const denied = await checkModule(session.schoolId, 'payroll');
    if (denied) return denied;
    await requirePermission(session.userId, session.schoolId, 'payroll.payments.process', session.isSuperAdmin);

    const { id, method, reference } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    connection = await getConnection();
    const [r]: any = await connection.execute(
      `UPDATE salary_payments SET method = ?, reference = ?
       WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [method || null, reference || null, id, session.schoolId]
    );
    if (r.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  } catch (e: any) {
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('salary_payments PUT:', e);
    return NextResponse.json({ error: 'Failed to update salary payment' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}

/** DELETE soft-deletes the payment and credits the wallet back. */
export async function DELETE(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const denied = await checkModule(session.schoolId, 'payroll');
    if (denied) return denied;
    await requirePermission(session.userId, session.schoolId, 'payroll.payments.process', session.isSuperAdmin);

    const { id, reason } = await req.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    connection = await getConnection();
    await connection.beginTransaction();

    const [rows]: any = await connection.execute(
      `SELECT wallet_id, amount FROM salary_payments
       WHERE id = ? AND school_id = ? AND deleted_at IS NULL FOR UPDATE`,
      [id, session.schoolId]
    );
    if (!rows.length) { await connection.rollback(); return NextResponse.json({ error: 'Not found' }, { status: 404 }); }

    await connection.execute(
      `UPDATE salary_payments SET deleted_at = NOW(), deleted_by = ?, delete_reason = ?
       WHERE id = ?`,
      [session.userId, reason ? String(reason).slice(0, 500) : null, id]
    );
    await connection.execute(
      `UPDATE wallets SET balance = balance + ? WHERE id = ?`,
      [rows[0].amount, rows[0].wallet_id]
    );
    await connection.execute(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, changes_json, created_at)
       VALUES (?, 'DELETE', 'SalaryPayment', ?, ?, NOW())`,
      [session.userId, id, JSON.stringify({ reason: reason || null, refunded_to_wallet: rows[0].wallet_id })]
    );

    await connection.commit();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    try { if (connection) await connection.rollback(); } catch {}
    if (e?.statusCode === 403) return NextResponse.json({ error: e.message }, { status: 403 });
    console.error('salary_payments DELETE:', e);
    return NextResponse.json({ error: 'Failed to reverse salary payment' }, { status: 500 });
  } finally { if (connection) await connection.end(); }
}
