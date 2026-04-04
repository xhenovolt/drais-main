/**
 * DRAIS Finance v2 — Ledger Service
 *
 * "Every shilling must have a source, destination, and history."
 *
 * IMMUTABLE RULES:
 *  1. Balance is NEVER stored — always calculated: SUM(debit) - SUM(credit)
 *  2. Ledger entries are NEVER deleted or updated after creation
 *  3. Every fee charge = debit entry, every payment = credit entry
 *  4. Fee assignment is idempotent (fee_assignment_log prevents duplicates)
 */
import { query, withTransaction } from '@/lib/db';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LedgerEntry {
  id: number;
  student_id: number;
  school_id: number;
  type: 'debit' | 'credit';
  amount: number;
  reference: string;
  fee_item_id: number | null;
  payment_id: number | null;
  term_id: number | null;
  notes: string | null;
  created_at: string;
  // joined
  student_name?: string;
  admission_no?: string;
}

export interface StudentBalance {
  student_id: number;
  school_id: number;
  total_charged: number;   // SUM(debit)
  total_paid: number;      // SUM(credit)
  balance: number;         // total_charged - total_paid  (positive = student owes)
  entry_count: number;
}

export interface FinanceFeeItem {
  id: number;
  name: string;
  amount: number;
  class_id: number | null;
  program_id: number | null;
  term_id: number | null;
  school_id: number;
  account_id: number | null;
  description: string | null;
  is_active: boolean;
}

export interface FinancePayment {
  id: number;
  student_id: number;
  school_id: number;
  amount: number;
  account_id: number | null;
  method: string;
  reference: string | null;
  receipt_no: string | null;
  paid_by: string | null;
  payer_contact: string | null;
  notes: string | null;
  created_at: string;
}

// ─── Balance Calculation ──────────────────────────────────────────────────────

/**
 * Calculate a single student's balance from the ledger.
 * O(1) aggregation — indexed on (student_id, school_id).
 */
export async function getStudentBalance(
  studentId: number,
  schoolId: number
): Promise<StudentBalance> {
  const rows: any[] = await query(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'debit'  THEN amount ELSE 0 END), 0) AS total_charged,
       COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) AS total_paid,
       COUNT(*) AS entry_count
     FROM student_ledger
     WHERE student_id = ? AND school_id = ?`,
    [studentId, schoolId]
  );
  const r = rows[0] ?? { total_charged: 0, total_paid: 0, entry_count: 0 };
  return {
    student_id: studentId,
    school_id: schoolId,
    total_charged: Number(r.total_charged),
    total_paid: Number(r.total_paid),
    balance: Number(r.total_charged) - Number(r.total_paid),
    entry_count: Number(r.entry_count),
  };
}

/**
 * Get balances for many students at once (used by student list).
 * Returns a Map<studentId, StudentBalance>.
 */
export async function getBalancesForStudents(
  studentIds: number[],
  schoolId: number
): Promise<Map<number, StudentBalance>> {
  if (!studentIds.length) return new Map();
  const placeholders = studentIds.map(() => '?').join(',');
  const rows: any[] = await query(
    `SELECT
       student_id,
       COALESCE(SUM(CASE WHEN type = 'debit'  THEN amount ELSE 0 END), 0) AS total_charged,
       COALESCE(SUM(CASE WHEN type = 'credit' THEN amount ELSE 0 END), 0) AS total_paid,
       COUNT(*) AS entry_count
     FROM student_ledger
     WHERE school_id = ? AND student_id IN (${placeholders})
     GROUP BY student_id`,
    [schoolId, ...studentIds]
  );
  const map = new Map<number, StudentBalance>();
  for (const r of rows) {
    const sid = Number(r.student_id);
    map.set(sid, {
      student_id: sid,
      school_id: schoolId,
      total_charged: Number(r.total_charged),
      total_paid: Number(r.total_paid),
      balance: Number(r.total_charged) - Number(r.total_paid),
      entry_count: Number(r.entry_count),
    });
  }
  // Fill zeros for students with no ledger entries
  for (const id of studentIds) {
    if (!map.has(id)) {
      map.set(id, { student_id: id, school_id: schoolId, total_charged: 0, total_paid: 0, balance: 0, entry_count: 0 });
    }
  }
  return map;
}

// ─── Ledger Entries ───────────────────────────────────────────────────────────

/**
 * Get full ledger history for a student (newest first).
 */
export async function getStudentLedger(
  studentId: number,
  schoolId: number,
  limit = 200
): Promise<LedgerEntry[]> {
  return query(
    `SELECT sl.*, t.name AS term_name
     FROM student_ledger sl
     LEFT JOIN terms t ON sl.term_id = t.id
     WHERE sl.student_id = ? AND sl.school_id = ?
     ORDER BY sl.created_at DESC
     LIMIT ?`,
    [studentId, schoolId, limit]
  );
}

/**
 * Add a raw debit entry (fee charge). Low-level — prefer assignFeesToStudent.
 */
export async function addDebitEntry(params: {
  studentId: number;
  schoolId: number;
  amount: number;
  reference: string;
  feeItemId?: number;
  termId?: number;
  createdBy?: number;
  notes?: string;
}): Promise<number> {
  const result: any = await query(
    `INSERT INTO student_ledger
       (student_id, school_id, type, amount, reference, fee_item_id, term_id, created_by, notes)
     VALUES (?, ?, 'debit', ?, ?, ?, ?, ?, ?)`,
    [
      params.studentId, params.schoolId, params.amount,
      params.reference, params.feeItemId ?? null,
      params.termId ?? null, params.createdBy ?? null,
      params.notes ?? null,
    ]
  );
  return result.insertId;
}

/**
 * Add a raw credit entry (payment / waiver). Low-level — prefer recordPayment.
 */
export async function addCreditEntry(params: {
  studentId: number;
  schoolId: number;
  amount: number;
  reference: string;
  paymentId?: number;
  termId?: number;
  createdBy?: number;
  notes?: string;
}): Promise<number> {
  const result: any = await query(
    `INSERT INTO student_ledger
       (student_id, school_id, type, amount, reference, payment_id, term_id, created_by, notes)
     VALUES (?, ?, 'credit', ?, ?, ?, ?, ?, ?)`,
    [
      params.studentId, params.schoolId, params.amount,
      params.reference, params.paymentId ?? null,
      params.termId ?? null, params.createdBy ?? null,
      params.notes ?? null,
    ]
  );
  return result.insertId;
}

// ─── Fee Assignment Engine ────────────────────────────────────────────────────

/**
 * Assign applicable fees to a student based on their class and programs.
 * IDEMPOTENT: uses fee_assignment_log to prevent double-charging.
 *
 * Returns the number of NEW fee entries created (0 if all already assigned).
 */
export async function assignFeesToStudent(params: {
  studentId: number;
  schoolId: number;
  classId: number;
  programIds?: number[];
  termId?: number;
  createdBy?: number;
}): Promise<{ assigned: number; skipped: number; entries: number[] }> {
  const { studentId, schoolId, classId, programIds = [], termId, createdBy } = params;

  // Find all applicable fee items for this student
  let feeQuery = `
    SELECT * FROM finance_fee_items
    WHERE school_id = ? AND is_active = 1
      AND (
        class_id IS NULL
        OR class_id = ?
        ${programIds.length ? `OR program_id IN (${programIds.map(() => '?').join(',')})` : ''}
      )
      ${termId ? 'AND (term_id IS NULL OR term_id = ?)' : ''}
  `;
  const feeParams: any[] = [schoolId, classId, ...programIds];
  if (termId) feeParams.push(termId);

  const feeItems: FinanceFeeItem[] = await query(feeQuery, feeParams);

  let assigned = 0;
  let skipped = 0;
  const entries: number[] = [];

  for (const item of feeItems) {
    // Idempotency: check if already assigned
    const existing: any[] = await query(
      `SELECT id FROM fee_assignment_log
       WHERE student_id = ? AND fee_item_id = ? AND (term_id = ? OR (term_id IS NULL AND ? IS NULL))`,
      [studentId, item.id, termId ?? null, termId ?? null]
    );
    if (existing.length > 0) {
      skipped++;
      continue;
    }

    // Create debit entry in student_ledger
    const termLabel = termId ? ` (Term ${termId})` : '';
    const ledgerId = await addDebitEntry({
      studentId, schoolId,
      amount: item.amount,
      reference: `${item.name}${termLabel}`,
      feeItemId: item.id,
      termId: termId ?? undefined,
      createdBy,
    });

    // Record in assignment log
    await query(
      `INSERT INTO fee_assignment_log (student_id, fee_item_id, term_id, school_id, ledger_id)
       VALUES (?, ?, ?, ?, ?)`,
      [studentId, item.id, termId ?? null, schoolId, ledgerId]
    );

    entries.push(ledgerId);
    assigned++;
  }

  return { assigned, skipped, entries };
}

// ─── Payment Recording ────────────────────────────────────────────────────────

/**
 * Record a payment:
 *  1. Insert into finance_payments
 *  2. Insert a 'credit' entry into student_ledger
 *  Both in a single transaction.
 */
export async function recordPayment(params: {
  studentId: number;
  schoolId: number;
  amount: number;
  method?: string;
  accountId?: number;
  reference?: string;
  receiptNo?: string;
  paidBy?: string;
  payerContact?: string;
  termId?: number;
  notes?: string;
  createdBy?: number;
}): Promise<{ paymentId: number; ledgerId: number; receiptNo: string }> {
  const receiptNo = params.receiptNo ?? generateReceiptNo();

  let paymentId = 0;
  let ledgerId = 0;

  await withTransaction(async (conn: any) => {
    const [payResult]: any = await conn.execute(
      `INSERT INTO finance_payments
         (student_id, school_id, amount, account_id, method, reference, receipt_no,
          paid_by, payer_contact, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        params.studentId, params.schoolId, params.amount,
        params.accountId ?? null, params.method ?? 'cash',
        params.reference ?? null, receiptNo,
        params.paidBy ?? null, params.payerContact ?? null,
        params.notes ?? null, params.createdBy ?? null,
      ]
    );
    paymentId = payResult.insertId;

    const [ledResult]: any = await conn.execute(
      `INSERT INTO student_ledger
         (student_id, school_id, type, amount, reference, payment_id, term_id, created_by)
       VALUES (?, ?, 'credit', ?, ?, ?, ?, ?)`,
      [
        params.studentId, params.schoolId, params.amount,
        `Payment — ${receiptNo}`, paymentId,
        params.termId ?? null, params.createdBy ?? null,
      ]
    );
    ledgerId = ledResult.insertId;
  });

  return { paymentId, ledgerId, receiptNo };
}

// ─── Bulk Import (Opening Balances) ──────────────────────────────────────────

export interface BulkBalanceRow {
  student_id: number;
  balance: number;           // positive = student owes (debit), negative = credit
  reference?: string;
}

/**
 * Import opening balances for multiple students.
 * INSERT only — never overwrites existing entries.
 * Returns per-student results.
 */
export async function bulkImportBalances(
  rows: BulkBalanceRow[],
  schoolId: number,
  termId?: number,
  createdBy?: number
): Promise<{ success: number; failed: number; errors: string[] }> {
  let success = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const row of rows) {
    try {
      if (!row.student_id || !row.balance) continue;
      const type = row.balance > 0 ? 'debit' : 'credit';
      const amount = Math.abs(row.balance);
      const ref = row.reference || 'Opening Balance';
      await query(
        `INSERT INTO student_ledger (student_id, school_id, type, amount, reference, term_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [row.student_id, schoolId, type, amount, ref, termId ?? null, createdBy ?? null]
      );
      success++;
    } catch (err: any) {
      failed++;
      errors.push(`student_id=${row.student_id}: ${err.message}`);
    }
  }
  return { success, failed, errors };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateReceiptNo(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `REC-${yy}${mm}-${rand}`;
}
