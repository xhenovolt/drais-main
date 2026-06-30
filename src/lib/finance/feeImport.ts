/**
 * Per-learner fee import (upsert).
 *
 * Import rows of { admission_no, item, amount } and apply them to a term:
 *   - learner already has that fee item this term  → UPDATE the amount
 *   - learner does not have it                      → INSERT it
 * Never creates a duplicate fee line for the same (learner, term, item).
 *
 * Both stores are kept consistent: student_fee_items (expected fees) and
 * student_ledger (the debit/charge that drives balances). The ledger debit for a
 * fee is matched by (student, term, notes = item name), so re-importing replaces
 * the prior charge — whether it came from a bill run or an earlier import.
 */
import { query } from '@/lib/db';

export interface FeeImportRow { admission_no?: string; item?: string; amount?: number | string }
export type FeeAction = 'insert' | 'update' | 'not_found' | 'invalid';
export interface FeeImportPreviewRow { admission_no: string; item: string; amount: number; action: FeeAction; old_amount?: number | null }
export interface FeeImportResult {
  total: number; inserted: number; updated: number; notFound: number; invalid: number;
  committed: boolean; preview: FeeImportPreviewRow[];
}

export async function runFeeImport(
  schoolId: number, rawRows: FeeImportRow[], termId: number,
  opts: { commit?: boolean } = {}, userId?: number | null,
): Promise<FeeImportResult> {
  const rows = (rawRows || []).map((r) => ({
    admission_no: String(r.admission_no ?? '').trim(),
    item: String(r.item ?? '').trim(),
    amount: Number(r.amount),
  }));

  // Resolve admission numbers → student ids (school-scoped).
  const admnos = [...new Set(rows.map((r) => r.admission_no).filter(Boolean))];
  const stuMap = new Map<string, number>();
  if (admnos.length) {
    const found = (await query(
      `SELECT id, admission_no FROM students WHERE school_id = ? AND admission_no IN (${admnos.map(() => '?').join(',')})`,
      [schoolId, ...admnos],
    )) as any[];
    for (const s of found) stuMap.set(String(s.admission_no), Number(s.id));
  }

  // Existing fee lines for these learners this term, keyed by student__item.
  const studentIds = [...new Set([...stuMap.values()])];
  const existing = new Map<string, { id: number; amount: number }>();
  if (studentIds.length) {
    const ex = (await query(
      `SELECT id, student_id, item, amount FROM student_fee_items
        WHERE term_id = ? AND student_id IN (${studentIds.map(() => '?').join(',')})`,
      [termId, ...studentIds],
    )) as any[];
    for (const e of ex) existing.set(`${e.student_id}__${e.item}`, { id: Number(e.id), amount: Number(e.amount) });
  }

  let inserted = 0, updated = 0, notFound = 0, invalid = 0;
  const preview: FeeImportPreviewRow[] = [];

  for (const r of rows) {
    if (!r.admission_no || !r.item || !Number.isFinite(r.amount) || r.amount < 0) {
      invalid++; preview.push({ admission_no: r.admission_no, item: r.item, amount: r.amount, action: 'invalid' }); continue;
    }
    const sid = stuMap.get(r.admission_no);
    if (!sid) { notFound++; preview.push({ admission_no: r.admission_no, item: r.item, amount: r.amount, action: 'not_found' }); continue; }

    const key = `${sid}__${r.item}`;
    const ex = existing.get(key);
    preview.push({ admission_no: r.admission_no, item: r.item, amount: r.amount, action: ex ? 'update' : 'insert', old_amount: ex ? ex.amount : null });

    if (opts.commit) {
      if (ex) {
        await query(`UPDATE student_fee_items SET amount = ? WHERE id = ?`, [r.amount, ex.id]);
        updated++;
      } else {
        await query(
          `INSERT INTO student_fee_items (student_id, term_id, item, amount, discount, waived, paid) VALUES (?, ?, ?, ?, 0, 0, 0)`,
          [sid, termId, r.item, r.amount],
        );
        existing.set(key, { id: 0, amount: r.amount }); // guard against duplicate rows in the same file
        inserted++;
      }
      // Ledger sync: replace any prior debit for this (student, term, item).
      await query(
        `DELETE FROM student_ledger WHERE school_id = ? AND student_id = ? AND term_id = ? AND type = 'debit' AND notes = ?`,
        [schoolId, sid, termId, r.item],
      );
      if (r.amount > 0) {
        await query(
          `INSERT INTO student_ledger (student_id, school_id, type, amount, reference, term_id, created_by, notes)
           VALUES (?, ?, 'debit', ?, ?, ?, ?, ?)`,
          [sid, schoolId, r.amount, `IMPORT-${termId}`, termId, userId ?? null, r.item],
        );
      }
    }
  }

  return { total: rows.length, inserted, updated, notFound, invalid, committed: !!opts.commit, preview: preview.slice(0, 500) };
}
