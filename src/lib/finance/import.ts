/**
 * Finance import / reconciliation engine (Track B, Batch 3).
 *
 * Two-phase, trust-first:
 *   1. PREVIEW  — stage rows, match learners (admission number, or a UNIQUE
 *                 name hit — both auto-import; multiple name candidates still
 *                 require manual review), detect duplicates against
 *                 already-recorded payments and within the file, and
 *                 summarise. Nothing posted.
 *   2. COMMIT   — after operator confirmation, post only the rows marked
 *                 `import` with a resolved student through the CANONICAL payment
 *                 path (recordPayment) or the opening-balance ledger writer.
 *
 * Supports source systems: manual_excel | schoolpay | surepay | bank |
 * mobile_money | custom. The client maps columns → these normalized fields, so
 * the engine is source-agnostic; source_system is recorded for the audit trail.
 */
import { query } from '@/lib/db';
import { recordPayment, addCreditEntry, addDebitEntry } from '@/lib/services/FinanceLedger';

export type SourceSystem = 'manual_excel' | 'schoolpay' | 'surepay' | 'bank' | 'mobile_money' | 'custom';
export type ImportType = 'payments' | 'opening_balances';
export type MatchStatus = 'matched' | 'ambiguous' | 'unmatched' | 'duplicate';

export interface NormalizedRow {
  row_no: number;
  admission_no?: string | null;
  student_name?: string | null;
  amount?: number | null;
  /** Outstanding balance owed right now (e.g. a sheet's "Balance" column).
   * For opening_balances imports this takes priority over `amount` — a
   * rate/fees-charged figure is NOT what's currently owed once payments are
   * netted, and silently charging the rate instead of the balance is exactly
   * the kind of double-charge this field exists to prevent. */
  balance?: number | null;
  reference?: string | null;
  payment_date?: string | null;
  method?: string | null;
  raw?: Record<string, unknown>;
}

export interface PreviewInput {
  schoolId: number;
  sourceSystem: SourceSystem;
  importType: ImportType;
  filename?: string;
  termId?: number | null;
  rows: NormalizedRow[];
  createdBy?: number | null;
}

function normName(s?: string | null): string {
  return (s || '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}
function tokenKey(s?: string | null): string {
  return normName(s).split(' ').filter(Boolean).sort().join(' ');
}

/** Stage + match + dedup a batch. Returns { batchId, summary, rows }. */
export async function createPreview(input: PreviewInput) {
  const { schoolId, sourceSystem, importType, filename, termId, rows, createdBy } = input;

  // 1. Load the school's learners for matching.
  const students = (await query(
    `SELECT s.id, s.admission_no,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name
       FROM students s LEFT JOIN people p ON p.id = s.person_id
      WHERE s.school_id = ?`,
    [schoolId],
  )) as Array<{ id: number; admission_no: string | null; name: string | null }>;

  const byAdmission = new Map<string, number>();
  const byName = new Map<string, number[]>();
  for (const s of students) {
    if (s.admission_no) byAdmission.set(String(s.admission_no).trim().toLowerCase(), s.id);
    const k = tokenKey(s.name);
    if (k) { const a = byName.get(k) || []; a.push(s.id); byName.set(k, a); }
  }

  // 2. Existing references already recorded — for duplicate detection.
  const existing = (await query(
    `SELECT reference FROM finance_payments WHERE school_id = ? AND reference IS NOT NULL AND reference <> ''`,
    [schoolId],
  )) as Array<{ reference: string }>;
  const existingRefs = new Set(existing.map((r) => String(r.reference).trim().toLowerCase()));

  // 3. Match + dedup each row.
  const seenInFile = new Set<string>();
  const staged = rows.map((r) => {
    const amount = importType === 'opening_balances' && r.balance != null
      ? Number(r.balance)
      : (r.amount != null ? Number(r.amount) : null);
    const ref = r.reference ? String(r.reference).trim() : null;
    let match_status: MatchStatus = 'unmatched';
    let matched_student_id: number | null = null;
    let candidates: number[] = [];
    let error: string | null = null;

    // Duplicate: same reference already recorded, or repeated within this file.
    const refKey = ref ? ref.toLowerCase() : null;
    const fileKey = `${refKey || ''}|${r.admission_no || ''}|${amount ?? ''}`;
    if (refKey && existingRefs.has(refKey)) {
      match_status = 'duplicate';
      error = 'Reference already recorded';
    } else if (seenInFile.has(fileKey) && (refKey || r.admission_no)) {
      match_status = 'duplicate';
      error = 'Duplicate row within file';
    } else {
      // Admission number first.
      const adm = r.admission_no ? String(r.admission_no).trim().toLowerCase() : null;
      if (adm && byAdmission.has(adm)) {
        match_status = 'matched';
        matched_student_id = byAdmission.get(adm)!;
      } else if (r.student_name) {
        // Name match: a UNIQUE hit is trusted (auto-import eligible), same as
        // admission number. Only multiple candidates require manual review —
        // schools without admission numbers on file (e.g. paper registers)
        // must not be forced to add them just to bulk-import.
        const cands = byName.get(tokenKey(r.student_name)) || [];
        if (cands.length === 1) { match_status = 'matched'; matched_student_id = cands[0]; }
        else if (cands.length > 1) { match_status = 'ambiguous'; candidates = cands; }
        else match_status = 'unmatched';
      } else {
        match_status = 'unmatched';
      }
    }
    if (match_status !== 'duplicate') seenInFile.add(fileKey);

    if (importType === 'payments' && match_status !== 'duplicate' && (amount == null || amount <= 0)) {
      error = error || 'Missing/invalid amount';
      if (match_status === 'matched') match_status = 'unmatched';
    }

    // Auto-select clean matched rows for import; everything else waits for review.
    const action: 'import' | 'skip' | 'pending' =
      match_status === 'matched' && !error ? 'import' : 'pending';

    return {
      row_no: r.row_no,
      admission_no: r.admission_no ?? null,
      student_name: r.student_name ?? null,
      amount,
      reference: ref,
      payment_date: r.payment_date ?? null,
      method: r.method ?? null,
      raw_json: r.raw ?? null,
      match_status,
      matched_student_id,
      candidates_json: candidates.length ? candidates : null,
      action,
      error,
    };
  });

  const summary = {
    total: staged.length,
    matched: staged.filter((s) => s.match_status === 'matched').length,
    ambiguous: staged.filter((s) => s.match_status === 'ambiguous').length,
    unmatched: staged.filter((s) => s.match_status === 'unmatched').length,
    duplicate: staged.filter((s) => s.match_status === 'duplicate').length,
  };

  // 4. Persist the batch + rows (preview).
  const batchRes = (await query(
    `INSERT INTO finance_import_batches
       (school_id, source_system, import_type, filename, status, term_id,
        total_rows, matched_rows, ambiguous_rows, unmatched_rows, duplicate_rows, summary_json, created_by)
     VALUES (?, ?, ?, ?, 'preview', ?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, sourceSystem, importType, filename ?? null, termId ?? null,
     summary.total, summary.matched, summary.ambiguous, summary.unmatched, summary.duplicate,
     JSON.stringify(summary), createdBy ?? null],
  )) as unknown as { insertId: number };
  const batchId = batchRes.insertId;

  for (const s of staged) {
    await query(
      `INSERT INTO finance_import_rows
         (batch_id, school_id, row_no, admission_no, student_name, amount, reference,
          payment_date, method, raw_json, match_status, matched_student_id, candidates_json, action, error)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [batchId, schoolId, s.row_no, s.admission_no, s.student_name, s.amount, s.reference,
       s.payment_date, s.method, s.raw_json ? JSON.stringify(s.raw_json) : null,
       s.match_status, s.matched_student_id, s.candidates_json ? JSON.stringify(s.candidates_json) : null,
       s.action, s.error],
    );
  }

  // Names for matched + candidate students so the wizard can render them.
  const referenced = new Set<number>();
  for (const s of staged) {
    if (s.matched_student_id) referenced.add(s.matched_student_id);
    (s.candidates_json || []).forEach((id) => referenced.add(id));
  }
  const studentsById: Record<number, { name: string | null; admission_no: string | null }> = {};
  for (const s of students) {
    if (referenced.has(s.id)) studentsById[s.id] = { name: s.name, admission_no: s.admission_no };
  }

  return { batchId, summary, rows: staged, studentsById };
}

/** Commit a previewed batch — posts only `import` rows with a resolved student. */
export async function commitBatch(schoolId: number, batchId: number, userId?: number | null) {
  const batchRows = (await query(
    `SELECT * FROM finance_import_batches WHERE id = ? AND school_id = ? LIMIT 1`,
    [batchId, schoolId],
  )) as any[];
  const batch = batchRows[0];
  if (!batch) throw new Error('Import batch not found');
  if (batch.status === 'committed') throw new Error('Batch already committed');

  const rows = (await query(
    `SELECT * FROM finance_import_rows
      WHERE batch_id = ? AND school_id = ? AND action = 'import' AND committed = 0
        AND matched_student_id IS NOT NULL`,
    [batchId, schoolId],
  )) as any[];

  let committed = 0;
  const errors: Array<{ row_no: number; error: string }> = [];
  for (const r of rows) {
    try {
      if (batch.import_type === 'opening_balances') {
        // positive = owes (debit), negative = credit; 0 = already cleared, nothing to post.
        const amt = Number(r.amount) || 0;
        if (amt > 0) {
          await addDebitEntry({ studentId: r.matched_student_id, schoolId, amount: amt,
            reference: r.reference || 'Opening Balance', termId: batch.term_id ?? undefined, createdBy: userId ?? undefined } as any);
        } else if (amt < 0) {
          await addCreditEntry({ studentId: r.matched_student_id, schoolId, amount: Math.abs(amt),
            reference: r.reference || 'Opening Balance', termId: batch.term_id ?? undefined, createdBy: userId ?? undefined } as any);
        }
      } else {
        await recordPayment({
          studentId: r.matched_student_id,
          schoolId,
          amount: Number(r.amount),
          method: r.method || 'other',
          reference: r.reference || undefined,
          termId: batch.term_id ?? undefined,
          createdBy: userId ?? undefined,
          notes: `Imported (${batch.source_system}) batch #${batchId}`,
        });
      }
      await query(`UPDATE finance_import_rows SET committed = 1 WHERE id = ?`, [r.id]);
      committed++;
    } catch (e: any) {
      errors.push({ row_no: r.row_no, error: e.message || 'commit failed' });
      await query(`UPDATE finance_import_rows SET error = ? WHERE id = ?`, [String(e.message || 'commit failed').slice(0, 250), r.id]);
    }
  }

  await query(
    `UPDATE finance_import_batches
        SET status = 'committed', committed_rows = ?, committed_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    [committed, batchId],
  );

  return { committed, errors };
}
