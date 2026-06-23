/**
 * Learner pocket money (Track B, Batch 6).
 *
 * A custodial wallet per learner. Balance is DERIVED from the transaction log
 * (deposits − withdrawals), never stored. Withdrawals cannot overdraw.
 */
import { query, withTransaction } from '@/lib/db';

export interface PocketAccount {
  account_id: number;
  student_id: number;
  student_name: string | null;
  admission_no: string | null;
  custodian: string | null;
  low_balance_threshold: number;
  deposits: number;
  withdrawals: number;
  balance: number;
  low: boolean;
}

/** Ensure a pocket-money account exists for a learner; returns its id. */
export async function getOrCreateAccount(schoolId: number, studentId: number, custodian?: string): Promise<number> {
  const existing = (await query(
    `SELECT id FROM pocket_money_accounts WHERE school_id = ? AND student_id = ? LIMIT 1`,
    [schoolId, studentId],
  )) as Array<{ id: number }>;
  if (existing[0]) return existing[0].id;
  const res = (await query(
    `INSERT INTO pocket_money_accounts (school_id, student_id, custodian) VALUES (?, ?, ?)`,
    [schoolId, studentId, custodian ?? null],
  )) as unknown as { insertId: number };
  return res.insertId;
}

/** All pocket-money accounts for the school with derived balances. */
export async function listAccounts(schoolId: number): Promise<PocketAccount[]> {
  const rows = (await query(
    `SELECT a.id AS account_id, a.student_id, a.custodian,
            CAST(a.low_balance_threshold AS DECIMAL(14,2)) AS low_balance_threshold,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS student_name,
            s.admission_no,
            COALESCE(SUM(CASE WHEN t.type = 'deposit' THEN t.amount ELSE 0 END), 0) AS deposits,
            COALESCE(SUM(CASE WHEN t.type = 'withdrawal' THEN t.amount ELSE 0 END), 0) AS withdrawals
       FROM pocket_money_accounts a
       JOIN students s ON s.id = a.student_id
       LEFT JOIN people p ON p.id = s.person_id
       LEFT JOIN pocket_money_transactions t ON t.account_id = a.id
      WHERE a.school_id = ?
      GROUP BY a.id, a.student_id, a.custodian, a.low_balance_threshold, p.first_name, p.last_name, s.admission_no
      ORDER BY student_name`,
    [schoolId],
  )) as any[];
  return rows.map((r) => {
    const deposits = Number(r.deposits) || 0;
    const withdrawals = Number(r.withdrawals) || 0;
    const balance = deposits - withdrawals;
    const threshold = Number(r.low_balance_threshold) || 0;
    return { ...r, low_balance_threshold: threshold, deposits, withdrawals, balance, low: threshold > 0 && balance <= threshold };
  });
}

export async function getBalance(schoolId: number, accountId: number): Promise<number> {
  const r = (await query(
    `SELECT COALESCE(SUM(CASE WHEN type='deposit' THEN amount ELSE -amount END), 0) AS bal
       FROM pocket_money_transactions WHERE account_id = ? AND school_id = ?`,
    [accountId, schoolId],
  )) as Array<{ bal: number }>;
  return Number(r[0]?.bal) || 0;
}

export async function getStatement(schoolId: number, studentId: number) {
  return query(
    `SELECT t.* FROM pocket_money_transactions t
       JOIN pocket_money_accounts a ON a.id = t.account_id
      WHERE a.school_id = ? AND t.student_id = ?
      ORDER BY t.created_at DESC`,
    [schoolId, studentId],
  );
}

/** Record a deposit or withdrawal. Withdrawals are guarded against overdraw. */
export async function recordTransaction(params: {
  schoolId: number;
  studentId: number;
  type: 'deposit' | 'withdrawal';
  amount: number;
  custodian?: string;
  reason?: string;
  depositorName?: string;
  slipNo?: string;
  notes?: string;
  approvedBy?: number | null;
  receivedBy?: number | null;
  createdBy?: number | null;
}): Promise<{ transactionId: number; balance: number }> {
  if (!(params.amount > 0)) throw new Error('Amount must be positive');
  const accountId = await getOrCreateAccount(params.schoolId, params.studentId, params.custodian);

  if (params.type === 'withdrawal') {
    const bal = await getBalance(params.schoolId, accountId);
    if (params.amount > bal + 1e-6) throw new Error(`Insufficient pocket money balance (${bal})`);
  }

  let transactionId = 0;
  await withTransaction(async (conn: any) => {
    const [res]: any = await conn.execute(
      `INSERT INTO pocket_money_transactions
         (school_id, student_id, account_id, type, amount, custodian, reason,
          depositor_name, approved_by, received_by, slip_no, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [params.schoolId, params.studentId, accountId, params.type, params.amount,
       params.custodian ?? null, params.reason ?? null, params.depositorName ?? null,
       params.approvedBy ?? null, params.receivedBy ?? null, params.slipNo ?? null,
       params.notes ?? null, params.createdBy ?? null],
    );
    transactionId = res.insertId;
    await conn.execute(
      `INSERT INTO finance_actions (school_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, ?, 'pocket_money', ?, ?)`,
      [params.schoolId, params.createdBy ?? null, `pocket_${params.type}`, transactionId,
       JSON.stringify({ studentId: params.studentId, amount: params.amount })],
    );
  });

  return { transactionId, balance: await getBalance(params.schoolId, accountId) };
}
