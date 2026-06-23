/**
 * Money locations + transfers (Track B, Batch 4).
 *
 * A "money location" is where cash actually sits: cash at bursar / headteacher,
 * a bank account, mobile money, School Pay, SurePay, etc. (rows in `wallets`).
 * Balance is DERIVED, never trusted as stored:
 *   balance = opening_balance
 *           + payments received into it      (finance_payments.account_id)
 *           + transfers in                   (finance_account_transfers.to)
 *           - transfers out                  (finance_account_transfers.from)
 *           - expenses paid from it          (expenditures.wallet_id)
 */
import { query, withTransaction } from '@/lib/db';

export interface MoneyLocation {
  id: number;
  name: string;
  location_type: string;
  currency: string;
  status: string;
  provider: string | null;
  account_number: string | null;
  bank_name: string | null;
  branch_name: string | null;
  opening_balance: number;
  payments_in: number;
  transfers_in: number;
  transfers_out: number;
  expenses_out: number;
  balance: number;
}

/** List locations with derived balances. */
export async function listLocations(schoolId: number): Promise<MoneyLocation[]> {
  const rows = (await query(
    `SELECT
        w.id, w.name, w.location_type, w.currency, w.status,
        w.provider, w.account_number, w.bank_name, w.branch_name,
        CAST(w.opening_balance AS DECIMAL(14,2)) AS opening_balance,
        COALESCE((SELECT SUM(fp.amount) FROM finance_payments fp
                   WHERE fp.account_id = w.id AND fp.school_id = w.school_id), 0) AS payments_in,
        COALESCE((SELECT SUM(t.amount) FROM finance_account_transfers t
                   WHERE t.to_wallet_id = w.id AND t.school_id = w.school_id), 0) AS transfers_in,
        COALESCE((SELECT SUM(t.amount) FROM finance_account_transfers t
                   WHERE t.from_wallet_id = w.id AND t.school_id = w.school_id), 0) AS transfers_out,
        COALESCE((SELECT SUM(e.amount) FROM expenditures e
                   WHERE e.wallet_id = w.id AND e.school_id = w.school_id
                     AND e.deleted_at IS NULL
                     AND (e.status IS NULL OR e.status NOT IN ('rejected','cancelled'))), 0) AS expenses_out
      FROM wallets w
     WHERE w.school_id = ?
     ORDER BY w.name`,
    [schoolId],
  )) as any[];

  return rows.map((r) => {
    const opening = Number(r.opening_balance) || 0;
    const pin = Number(r.payments_in) || 0;
    const tin = Number(r.transfers_in) || 0;
    const tout = Number(r.transfers_out) || 0;
    const eout = Number(r.expenses_out) || 0;
    return {
      ...r,
      opening_balance: opening,
      payments_in: pin,
      transfers_in: tin,
      transfers_out: tout,
      expenses_out: eout,
      balance: opening + pin + tin - tout - eout,
    } as MoneyLocation;
  });
}

/** Create a money location. */
export async function createLocation(params: {
  schoolId: number;
  name: string;
  locationType: string;
  currency?: string;
  provider?: string | null;
  accountNumber?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  openingBalance?: number;
}): Promise<number> {
  const res = (await query(
    `INSERT INTO wallets
       (school_id, name, location_type, currency, status, provider, account_number,
        bank_name, branch_name, opening_balance, balance)
     VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, 0)`,
    [
      params.schoolId, params.name, params.locationType, params.currency || 'UGX',
      params.provider ?? null, params.accountNumber ?? null, params.bankName ?? null,
      params.branchName ?? null, params.openingBalance ?? 0,
    ],
  )) as unknown as { insertId: number };
  return res.insertId;
}

/** Record a transfer between two locations (validated, single transaction). */
export async function createTransfer(params: {
  schoolId: number;
  fromWalletId: number;
  toWalletId: number;
  amount: number;
  transferType?: string;
  reference?: string;
  notes?: string;
  createdBy?: number | null;
}): Promise<number> {
  if (params.fromWalletId === params.toWalletId) throw new Error('Source and destination must differ');
  if (!(params.amount > 0)) throw new Error('Amount must be positive');

  // Both locations must belong to this school.
  const owned = (await query(
    `SELECT id FROM wallets WHERE id IN (?, ?) AND school_id = ?`,
    [params.fromWalletId, params.toWalletId, params.schoolId],
  )) as Array<{ id: number }>;
  if (owned.length !== 2) throw new Error('Both locations must belong to this school');

  // Guard against overdrawing the source.
  const locations = await listLocations(params.schoolId);
  const from = locations.find((l) => l.id === params.fromWalletId);
  if (from && params.amount > from.balance + 1e-6) {
    throw new Error(`Insufficient funds in ${from.name} (balance ${from.balance})`);
  }

  let transferId = 0;
  await withTransaction(async (conn: any) => {
    const [res]: any = await conn.execute(
      `INSERT INTO finance_account_transfers
         (school_id, from_wallet_id, to_wallet_id, amount, transfer_type, reference, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [params.schoolId, params.fromWalletId, params.toWalletId, params.amount,
       params.transferType ?? null, params.reference ?? null, params.notes ?? null, params.createdBy ?? null],
    );
    transferId = res.insertId;
    await conn.execute(
      `INSERT INTO finance_actions (school_id, actor_user_id, action, entity_type, entity_id, metadata)
       VALUES (?, ?, 'transfer', 'account_transfer', ?, ?)`,
      [params.schoolId, params.createdBy ?? null, transferId,
       JSON.stringify({ from: params.fromWalletId, to: params.toWalletId, amount: params.amount, type: params.transferType })],
    );
  });
  return transferId;
}
