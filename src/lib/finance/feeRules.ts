/**
 * Fee rules engine — model + learner matching (Batch A).
 *
 * A fee item can have several eligibility rules (ORed). Within a rule, every set
 * condition is ANDed (e.g. girls AND classes P1–P3). Conditions key off the
 * learner's ACTIVE enrollment + person:
 *   gender → people.gender · boarding → study_modes.name · program → program_id
 *   stream → stream_id · class → class_id / class_level range · term · year.
 * `buildLearnerMatch` is reused by the Batch B evaluator.
 */
import { query } from '@/lib/db';

export interface FeeRule {
  id?: number;
  class_ids?: number[] | null;
  level_min?: number | null;
  level_max?: number | null;
  gender?: string | null;
  boarding?: 'boarding' | 'day' | null;
  stream_id?: number | null;
  program_id?: number | null;
  is_candidate?: number | boolean | null;
  term_id?: number | null;
  academic_year_id?: number | null;
}

/** Build the WHERE fragment + params that select learners matching a rule. */
export function buildLearnerMatch(rule: FeeRule): { where: string; params: any[] } {
  const clauses: string[] = [];
  const params: any[] = [];

  const classIds = Array.isArray(rule.class_ids) ? rule.class_ids.filter((n) => Number.isFinite(Number(n))).map(Number) : [];
  if (classIds.length) { clauses.push(`e.class_id IN (${classIds.map(() => '?').join(',')})`); params.push(...classIds); }
  if (rule.level_min != null) { clauses.push(`c.class_level >= ?`); params.push(rule.level_min); }
  if (rule.level_max != null) { clauses.push(`c.class_level <= ?`); params.push(rule.level_max); }
  if (rule.gender) { clauses.push(`LOWER(p.gender) = ?`); params.push(String(rule.gender).toLowerCase()); }
  if (rule.boarding) {
    // study_modes.name like 'Boarding'/'Day'
    clauses.push(`LOWER(sm.name) LIKE ?`); params.push(rule.boarding === 'boarding' ? 'board%' : 'day%');
  }
  if (rule.stream_id) { clauses.push(`e.stream_id = ?`); params.push(rule.stream_id); }
  if (rule.program_id) { clauses.push(`e.program_id = ?`); params.push(rule.program_id); }
  if (rule.term_id) { clauses.push(`e.term_id = ?`); params.push(rule.term_id); }
  if (rule.academic_year_id) { clauses.push(`e.academic_year_id = ?`); params.push(rule.academic_year_id); }

  return { where: clauses.length ? clauses.join(' AND ') : '1=1', params };
}

const LEARNER_FROM = `
  FROM students s
  JOIN enrollments e ON e.student_id = s.id AND e.status = 'active' AND e.school_id = s.school_id
  JOIN people p ON p.id = s.person_id
  LEFT JOIN classes c ON c.id = e.class_id
  LEFT JOIN study_modes sm ON sm.id = e.study_mode_id
  WHERE s.school_id = ? AND s.status = 'active'`;

/** Count + sample of learners a rule would apply to (for "preview affected learners"). */
export async function previewRuleLearners(schoolId: number, rule: FeeRule, sample = 15) {
  const { where, params } = buildLearnerMatch(rule);
  const [cnt] = (await query(
    `SELECT COUNT(DISTINCT s.id) AS n ${LEARNER_FROM} AND (${where})`,
    [schoolId, ...params],
  )) as any[];
  const learners = (await query(
    `SELECT DISTINCT s.id, s.admission_no,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name, c.name AS class_name
       ${LEARNER_FROM} AND (${where})
      ORDER BY name LIMIT ${Math.max(1, Math.min(100, sample))}`,
    [schoolId, ...params],
  )) as any[];
  return { count: Number(cnt?.n) || 0, learners };
}

// ── Fee item CRUD ──
export async function listFeeItems(schoolId: number) {
  return query(`SELECT * FROM fee_items WHERE school_id = ? ORDER BY category, name`, [schoolId]) as Promise<any[]>;
}
export async function createFeeItem(schoolId: number, b: any, userId?: number | null): Promise<number> {
  const res = (await query(
    `INSERT INTO fee_items (school_id, name, code, category, default_amount, currency, frequency,
        mandatory, optional, is_active, payment_channel, clearance, effective_from, effective_to, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, b.name, b.code ?? null, b.category ?? 'other', Number(b.default_amount) || 0,
     b.currency ?? 'UGX', b.frequency ?? 'termly', b.mandatory ? 1 : 0, b.optional ? 1 : 0,
     b.is_active === false ? 0 : 1, b.payment_channel ?? 'any', b.clearance ?? 'optional',
     b.effective_from ?? null, b.effective_to ?? null, b.notes ?? null, userId ?? null],
  )) as unknown as { insertId: number };
  return res.insertId;
}
export async function updateFeeItem(schoolId: number, id: number, b: any): Promise<void> {
  const cols = ['name', 'code', 'category', 'default_amount', 'currency', 'frequency', 'mandatory', 'optional', 'is_active', 'payment_channel', 'clearance', 'effective_from', 'effective_to', 'notes'];
  const sets: string[] = []; const params: any[] = [];
  for (const c of cols) if (b[c] !== undefined) {
    sets.push(`${c} = ?`);
    params.push(['mandatory', 'optional', 'is_active'].includes(c) ? (b[c] ? 1 : 0) : b[c]);
  }
  if (!sets.length) return;
  params.push(id, schoolId);
  await query(`UPDATE fee_items SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`, params);
}

// ── Rule CRUD ──
export async function listRules(schoolId: number, feeItemId?: number) {
  const sql = `SELECT * FROM fee_eligibility_rules WHERE school_id = ?${feeItemId ? ' AND fee_item_id = ?' : ''} ORDER BY priority, id`;
  return query(sql, feeItemId ? [schoolId, feeItemId] : [schoolId]) as Promise<any[]>;
}
export async function createRule(schoolId: number, b: any, userId?: number | null): Promise<number> {
  const res = (await query(
    `INSERT INTO fee_eligibility_rules (school_id, fee_item_id, name, applies_to, class_ids, level_min, level_max,
        gender, boarding, stream_id, program_id, is_candidate, is_new_entrant, term_id, academic_year_id, amount, priority, is_active, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, b.fee_item_id, b.name ?? null, b.applies_to ?? 'segment',
     b.class_ids ? JSON.stringify(b.class_ids) : null, b.level_min ?? null, b.level_max ?? null,
     b.gender ?? null, b.boarding ?? null, b.stream_id ?? null, b.program_id ?? null,
     b.is_candidate ? 1 : null,
     b.is_new_entrant == null ? null : (b.is_new_entrant ? 1 : 0),
     b.term_id ?? null, b.academic_year_id ?? null,
     b.amount != null && b.amount !== '' ? Number(b.amount) : null, b.priority ?? 100,
     b.is_active === false ? 0 : 1, b.notes ?? null, userId ?? null],
  )) as unknown as { insertId: number };
  return res.insertId;
}
export async function deleteRule(schoolId: number, id: number): Promise<void> {
  await query(`DELETE FROM fee_eligibility_rules WHERE id = ? AND school_id = ?`, [id, schoolId]);
}

// ── Rule evaluator (Batch B) ──

export interface LearnerCtx {
  studentId: number;
  classId: number | null;
  classLevel: number | null;
  streamId: number | null;
  programId: number | null;
  gender: string | null;
  boarding: 'boarding' | 'day' | null;
  isNewEntrant: boolean | null;   // enrollment_type = 'new'
  termId: number | null;
  academicYearId: number | null;
}

function parseClassIds(v: any): number[] {
  if (!v) return [];
  try { const a = typeof v === 'string' ? JSON.parse(v) : v; return Array.isArray(a) ? a.map(Number) : []; } catch { return []; }
}

/** PURE: does a rule apply to a learner? Every SET condition must match (AND);
 *  an empty rule (no conditions) applies to everyone. Explains the decision. */
export function ruleMatchesLearner(rule: any, ctx: LearnerCtx): { match: boolean; reason: string } {
  const why: string[] = [];
  const classIds = parseClassIds(rule.class_ids);
  if (classIds.length) {
    // class_id arrives as a string under bigNumberStrings; class_ids JSON holds
    // numbers — coerce both sides so the membership test is type-safe.
    if (ctx.classId == null || !classIds.includes(Number(ctx.classId))) return { match: false, reason: 'class not in rule set' };
    why.push('class matches');
  }
  if (rule.level_min != null) { if (ctx.classLevel == null || ctx.classLevel < rule.level_min) return { match: false, reason: 'below class-level range' }; why.push(`level ≥ ${rule.level_min}`); }
  if (rule.level_max != null) { if (ctx.classLevel == null || ctx.classLevel > rule.level_max) return { match: false, reason: 'above class-level range' }; why.push(`level ≤ ${rule.level_max}`); }
  if (rule.gender) { if ((ctx.gender || '').toLowerCase() !== String(rule.gender).toLowerCase()) return { match: false, reason: 'gender mismatch' }; why.push(`gender ${rule.gender}`); }
  if (rule.boarding) { if (ctx.boarding !== rule.boarding) return { match: false, reason: 'residence mismatch' }; why.push(rule.boarding); }
  if (rule.is_new_entrant != null) {
    const wantNew = Number(rule.is_new_entrant) === 1;
    if (!!ctx.isNewEntrant !== wantNew) return { match: false, reason: wantNew ? 'not a new entrant' : 'not a continuing learner' };
    why.push(wantNew ? 'new entrant' : 'continuing learner');
  }
  if (rule.stream_id) { if (ctx.streamId !== rule.stream_id) return { match: false, reason: 'stream mismatch' }; why.push('stream matches'); }
  if (rule.program_id) { if (ctx.programId !== rule.program_id) return { match: false, reason: 'program mismatch' }; why.push('program matches'); }
  if (rule.term_id) { if (ctx.termId !== rule.term_id) return { match: false, reason: 'different term' }; why.push('term matches'); }
  if (rule.academic_year_id) { if (ctx.academicYearId !== rule.academic_year_id) return { match: false, reason: 'different year' }; why.push('year matches'); }
  return { match: true, reason: why.length ? why.join(' · ') : 'applies to all learners' };
}

function rowToCtx(r: any, termId?: number | null): LearnerCtx {
  const sm = (r.study_mode || '').toLowerCase();
  return {
    studentId: r.id,
    classId: r.class_id ?? null,
    classLevel: r.class_level ?? null,
    streamId: r.stream_id ?? null,
    programId: r.program_id ?? null,
    gender: r.gender ?? null,
    boarding: sm.startsWith('board') ? 'boarding' : (sm.startsWith('day') ? 'day' : null),
    isNewEntrant: r.enrollment_type == null ? null : String(r.enrollment_type).toLowerCase() === 'new',
    termId: termId ?? r.term_id ?? null,
    academicYearId: r.academic_year_id ?? null,
  };
}

const CTX_SELECT = `
  SELECT s.id, e.class_id, e.stream_id, e.program_id, e.term_id, e.academic_year_id,
         e.enrollment_type,
         c.class_level, p.gender, sm.name AS study_mode
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.status = 'active' AND e.school_id = s.school_id
    LEFT JOIN classes c ON c.id = e.class_id
    LEFT JOIN people p ON p.id = s.person_id
    LEFT JOIN study_modes sm ON sm.id = e.study_mode_id`;

export async function loadLearnerContext(schoolId: number, studentId: number, termId?: number | null): Promise<LearnerCtx | null> {
  const rows = (await query(`${CTX_SELECT} WHERE s.id = ? AND s.school_id = ? LIMIT 1`, [studentId, schoolId])) as any[];
  return rows[0] ? rowToCtx(rows[0], termId) : null;
}

export interface BillLine {
  fee_item_id: number; name: string; category: string;
  base_amount: number;    // rule/segment amount before adjustments
  discount: number;       // to store in student_fee_items.discount
  waived: number;         // to store in student_fee_items.waived
  amount: number;         // to store in student_fee_items.amount (override replaces base)
  final: number;          // net payable = amount - discount - waived
  mandatory: boolean;
  payment_channel: string; // any | school_code | bank | mobile_money | cash | bursar_cash
  clearance: string;       // optional | before_entry | partial_allowed | bursar_approval
  rule_id: number | null;
  reason: string;
  adjustments: string[];  // human-readable adjustment notes
}

/** PURE: collapse approved adjustments for one line. override > waiver > discounts. */
export function applyAdjustments(base: number, adjs: any[]): { amount: number; discount: number; waived: number; final: number; notes: string[] } {
  const notes: string[] = [];
  const override = adjs.find((a) => a.adjustment_type === 'override');
  if (override) {
    const v = Number(override.value) || 0;
    notes.push(`override → ${v}${override.tag ? ` (${override.tag})` : ''}`);
    return { amount: v, discount: 0, waived: 0, final: Math.max(0, v), notes };
  }
  if (adjs.some((a) => a.adjustment_type === 'waiver')) {
    const w = adjs.find((a) => a.adjustment_type === 'waiver');
    notes.push(`waiver${w?.tag ? ` (${w.tag})` : ''}`);
    return { amount: base, discount: 0, waived: base, final: 0, notes };
  }
  let discount = 0;
  for (const a of adjs) {
    if (a.adjustment_type === 'fixed_discount') { discount += Number(a.value) || 0; notes.push(`-${Number(a.value) || 0}${a.tag ? ` (${a.tag})` : ''}`); }
    else if (a.adjustment_type === 'percent_discount') { const d = base * (Number(a.value) || 0) / 100; discount += d; notes.push(`-${a.value}%${a.tag ? ` (${a.tag})` : ''}`); }
  }
  discount = Math.min(discount, base);
  return { amount: base, discount, waived: 0, final: Math.max(0, base - discount), notes };
}

/** PURE: given items + rules + learner (+ optional approved adjustments by item),
 *  produce the applicable, adjusted bill lines. `adjustmentsByItem` key: fee_item_id
 *  or 0 for learner-wide (fee_item_id NULL) adjustments. */
export function evaluateBill(
  items: any[], rulesByItem: Map<number, any[]>, ctx: LearnerCtx,
  adjustmentsByItem?: Map<number, any[]>,
): { lines: BillLine[]; total: number } {
  const lines: BillLine[] = [];
  for (const item of items) {
    const rules = (rulesByItem.get(item.id) || []).filter((r) => Number(r.is_active) !== 0);
    let chosen: any = null; let chosenReason = '';
    for (const rule of rules) {
      const m = ruleMatchesLearner(rule, ctx);
      if (m.match) {
        if (!chosen
          || Number(rule.priority ?? 100) < Number(chosen.priority ?? 100)
          || (Number(rule.priority ?? 100) === Number(chosen.priority ?? 100) && rule.amount != null && chosen.amount == null)) {
          chosen = rule; chosenReason = m.reason;
        }
      }
    }
    if (!chosen) continue;
    const base = chosen.amount != null ? Number(chosen.amount) : Number(item.default_amount) || 0;
    const adjs = [...(adjustmentsByItem?.get(item.id) || []), ...(adjustmentsByItem?.get(0) || [])];
    const adj = applyAdjustments(base, adjs);
    lines.push({
      fee_item_id: item.id, name: item.name, category: item.category,
      base_amount: base, discount: adj.discount, waived: adj.waived, amount: adj.amount, final: adj.final,
      mandatory: Number(item.mandatory) !== 0,
      payment_channel: item.payment_channel || 'any',
      clearance: item.clearance || 'optional',
      rule_id: chosen.id, reason: `${item.name}: ${chosenReason}`, adjustments: adj.notes,
    });
  }
  return { lines, total: lines.reduce((s, l) => s + l.final, 0) };
}

/** Evaluate one learner's applicable fees for a term (preview, no write). */
export async function evaluateLearnerFees(schoolId: number, studentId: number, termId?: number | null) {
  const ctx = await loadLearnerContext(schoolId, studentId, termId);
  if (!ctx) return { error: 'Learner not found', lines: [], total: 0 };
  const items = (await query(`SELECT * FROM fee_items WHERE school_id = ? AND is_active = 1`, [schoolId])) as any[];
  const rules = (await query(`SELECT * FROM fee_eligibility_rules WHERE school_id = ? AND is_active = 1`, [schoolId])) as any[];
  const byItem = new Map<number, any[]>();
  for (const r of rules) { const a = byItem.get(r.fee_item_id) || []; a.push(r); byItem.set(r.fee_item_id, a); }
  const adjByStudent = await loadAdjustmentsByStudent(schoolId, [studentId], termId);
  return { ctx, ...evaluateBill(items, byItem, ctx, adjByStudent.get(studentId)) };
}

/**
 * Generate bills for a set of learners for a term. Preview returns counts/totals;
 * commit SNAPSHOTS lines into student_fee_items (the live materialized store),
 * skipping (student, term, item) rows that already exist (idempotent).
 */
export async function generateBills(
  schoolId: number,
  opts: { termId: number; classId?: number | null; commit?: boolean },
) {
  const { termId } = opts;
  // Batched: load ALL target learner contexts in one query (no N+1 over the
  // remote DB), plus items + rules.
  const ctxRows = (await query(
    `${CTX_SELECT} WHERE s.school_id = ? AND s.status = 'active' ${opts.classId ? 'AND e.class_id = ?' : ''}`,
    opts.classId ? [schoolId, opts.classId] : [schoolId],
  )) as any[];
  const contexts = ctxRows.map((r) => rowToCtx(r, termId));

  const items = (await query(`SELECT * FROM fee_items WHERE school_id = ? AND is_active = 1`, [schoolId])) as any[];
  const rules = (await query(`SELECT * FROM fee_eligibility_rules WHERE school_id = ? AND is_active = 1`, [schoolId])) as any[];
  const byItem = new Map<number, any[]>();
  for (const r of rules) { const a = byItem.get(r.fee_item_id) || []; a.push(r); byItem.set(r.fee_item_id, a); }

  // Frequency-aware idempotency. Load each learner's existing fee lines across
  // ALL terms, then skip a candidate by the item's frequency:
  //   once      → already billed in ANY term
  //   annually  → already billed in a term of the SAME academic year
  //   else      → already billed in THIS term (termly/monthly/custom)
  const freqByName = new Map<string, string>(items.map((i) => [i.name, String(i.frequency || 'termly')]));
  const yearByTerm = new Map<number, number | null>();
  if (opts.commit) {
    const termRows = (await query(`SELECT id, academic_year_id FROM terms WHERE school_id = ?`, [schoolId])) as any[];
    for (const t of termRows) yearByTerm.set(Number(t.id), t.academic_year_id == null ? null : Number(t.academic_year_id));
  }
  const currentYear = yearByTerm.get(Number(termId)) ?? null;
  const existingTerms = new Map<string, Set<number>>();   // `${student}__${item}` → term_ids billed
  if (opts.commit && contexts.length) {
    const ids = contexts.map((c) => c.studentId);
    const rows = (await query(
      `SELECT student_id, item, term_id FROM student_fee_items
        WHERE student_id IN (${ids.map(() => '?').join(',')})`,
      [...ids],
    )) as any[];
    for (const r of rows) {
      const k = `${r.student_id}__${r.item}`;
      (existingTerms.get(k) ?? existingTerms.set(k, new Set()).get(k)!).add(Number(r.term_id));
    }
  }
  const alreadyBilled = (studentId: number, name: string): boolean => {
    const terms = existingTerms.get(`${studentId}__${name}`);
    if (!terms || !terms.size) return false;
    const freq = freqByName.get(name) || 'termly';
    if (freq === 'once') return true;
    if (freq === 'annually') return [...terms].some((t) => yearByTerm.get(t) === currentYear);
    return terms.has(Number(termId));
  };

  // Approved per-learner adjustments (waiver/discount/override), batched.
  const adjByStudent = await loadAdjustmentsByStudent(schoolId, contexts.map((c) => c.studentId), termId);

  let learnersAffected = 0, linesTotal = 0, amountTotal = 0, inserted = 0, skipped = 0;
  const toInsert: any[][] = [];
  const ledgerInsert: any[][] = [];   // debit (charge) per new line → keeps balances correct
  // A learner can have several active enrollments (e.g. secular + theology), so
  // the same fee can be evaluated more than once in a single run. Dedup per
  // (student, item) ACROSS contexts so an all-learners fee is charged once.
  const billedThisRun = new Set<string>();
  const countedStudents = new Set<number>();
  for (const ctx of contexts) {
    const { lines, total } = evaluateBill(items, byItem, ctx, adjByStudent.get(ctx.studentId));
    if (!lines.length) continue;
    if (!countedStudents.has(ctx.studentId)) { learnersAffected++; countedStudents.add(ctx.studentId); }
    linesTotal += lines.length; amountTotal += total;
    if (opts.commit) {
      for (const line of lines) {
        const key = `${ctx.studentId}__${line.name}`;
        if (billedThisRun.has(key) || alreadyBilled(ctx.studentId, line.name)) { skipped++; continue; }
        billedThisRun.add(key);
        // Snapshot the adjusted breakdown: balance (generated) = amount - discount - waived.
        // fee_item_id (Finance Consolidation Stage A) — the FK back to the
        // catalog this line actually came from, alongside the legacy `item`
        // text column (kept for any code still matching by name).
        toInsert.push([ctx.studentId, termId, line.name, line.amount, line.discount, line.waived, line.fee_item_id ?? null]);
        // Mirror the net charge into the ledger so balance (SUM debit-credit) is
        // correct. Only newly-inserted lines get a debit → no double-charging on
        // re-run (student_fee_items de-dup above gates this).
        if (line.final > 0) {
          ledgerInsert.push([ctx.studentId, schoolId, line.final, `BILL-${termId}`, line.fee_item_id, termId, line.name]);
        }
      }
    }
  }

  // Batched insert (chunked).
  if (opts.commit && toInsert.length) {
    for (let i = 0; i < toInsert.length; i += 500) {
      const slice = toInsert.slice(i, i + 500);
      const ph = slice.map(() => '(?, ?, ?, ?, ?, ?, 0, ?)').join(', ');
      await query(
        `INSERT INTO student_fee_items (student_id, term_id, item, amount, discount, waived, paid, fee_item_id) VALUES ${ph}`,
        slice.flat(),
      );
    }
    inserted = toInsert.length;
  }
  // Batched ledger debits (charges) for the same new lines.
  if (opts.commit && ledgerInsert.length) {
    for (let i = 0; i < ledgerInsert.length; i += 500) {
      const slice = ledgerInsert.slice(i, i + 500);
      const ph = slice.map(() => "(?, ?, 'debit', ?, ?, ?, ?, ?)").join(', ');
      await query(
        `INSERT INTO student_ledger (student_id, school_id, type, amount, reference, fee_item_id, term_id, notes) VALUES ${ph}`,
        slice.flat(),
      );
    }
  }

  return { learners: contexts.length, learnersAffected, linesTotal, amountTotal, inserted, skipped, committed: !!opts.commit };
}

// ── Per-learner adjustments (Batch C) ──

export type AdjustmentType = 'waiver' | 'percent_discount' | 'fixed_discount' | 'override';

/** Approved, in-window adjustments grouped: studentId → (fee_item_id|0) → rows. */
export async function loadAdjustmentsByStudent(
  schoolId: number, studentIds: number[], termId?: number | null,
): Promise<Map<number, Map<number, any[]>>> {
  const out = new Map<number, Map<number, any[]>>();
  if (!studentIds.length) return out;
  const rows = (await query(
    `SELECT * FROM learner_fee_adjustments
      WHERE school_id = ? AND status = 'approved'
        AND student_id IN (${studentIds.map(() => '?').join(',')})
        AND (term_id IS NULL ${termId ? 'OR term_id = ?' : ''})
        AND (effective_from IS NULL OR effective_from <= CURDATE())
        AND (effective_to   IS NULL OR effective_to   >= CURDATE())`,
    termId ? [schoolId, ...studentIds, termId] : [schoolId, ...studentIds],
  )) as any[];
  for (const r of rows) {
    const byItem = out.get(r.student_id) || new Map<number, any[]>();
    const key = r.fee_item_id == null ? 0 : Number(r.fee_item_id);
    const arr = byItem.get(key) || []; arr.push(r); byItem.set(key, arr);
    out.set(r.student_id, byItem);
  }
  return out;
}

export async function listAdjustments(schoolId: number, studentId?: number) {
  const sql = `SELECT a.*, fi.name AS fee_item_name
                 FROM learner_fee_adjustments a
                 LEFT JOIN fee_items fi ON fi.id = a.fee_item_id
                WHERE a.school_id = ?${studentId ? ' AND a.student_id = ?' : ''}
                ORDER BY a.created_at DESC`;
  return query(sql, studentId ? [schoolId, studentId] : [schoolId]) as Promise<any[]>;
}

export async function createAdjustment(schoolId: number, b: any, userId?: number | null): Promise<number> {
  const res = (await query(
    `INSERT INTO learner_fee_adjustments
       (school_id, student_id, fee_item_id, term_id, academic_year_id, adjustment_type,
        value, tag, reason, status, effective_from, effective_to, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
    [schoolId, b.student_id, b.fee_item_id ?? null, b.term_id ?? null, b.academic_year_id ?? null,
     b.adjustment_type, Number(b.value) || 0, b.tag ?? null, b.reason ?? null,
     b.effective_from ?? null, b.effective_to ?? null, userId ?? null],
  )) as unknown as { insertId: number };
  return res.insertId;
}

export async function setAdjustmentStatus(
  schoolId: number, id: number, status: 'approved' | 'rejected' | 'pending', userId?: number | null,
): Promise<void> {
  if (status === 'approved') {
    await query(
      `UPDATE learner_fee_adjustments SET status='approved', approved_by=?, approved_at=CURRENT_TIMESTAMP
        WHERE id=? AND school_id=?`, [userId ?? null, id, schoolId]);
  } else {
    await query(`UPDATE learner_fee_adjustments SET status=? WHERE id=? AND school_id=?`, [status, id, schoolId]);
  }
}

export async function deleteAdjustment(schoolId: number, id: number): Promise<void> {
  await query(`DELETE FROM learner_fee_adjustments WHERE id=? AND school_id=?`, [id, schoolId]);
}

// ── Entry-clearance engine (Phase 5) ──

export type ClearanceStatus =
  | 'cleared' | 'partially_cleared' | 'not_cleared' | 'blocked'
  | 'exception_requested' | 'exception_approved';

export interface ClearanceResult {
  requiredBeforeEntry: number;  // amount that must be paid before a learner may enter
  paid: number;                 // amount paid by the learner this term
  missing: number;              // shortfall against the entry requirement
  missingItems: string[];       // mandatory before-entry items not yet covered
  status: ClearanceStatus;
}

/**
 * PURE: decide a learner's entry-clearance from their bill lines + amount paid.
 * Per-item clearance semantics:
 *   before_entry    → 100% of the line must be paid before entry
 *   partial_allowed → at least half the line must be paid before entry
 *   bursar_approval → not required up-front, but a bursar exception clears it
 *   optional        → no entry requirement
 * `exception` is the learner's latest fee_clearance_exception row (or null).
 */
export function computeClearance(
  lines: BillLine[], paid: number, exception?: { status?: string } | null,
): ClearanceResult {
  const reqLines = lines.filter((l) => l.clearance === 'before_entry' || l.clearance === 'partial_allowed');
  const requiredBeforeEntry = reqLines.reduce(
    (s, l) => s + (l.clearance === 'partial_allowed' ? l.final / 2 : l.final), 0,
  );
  const missing = Math.max(0, requiredBeforeEntry - Math.max(0, paid));
  const missingItems = missing > 0 ? reqLines.map((l) => l.name) : [];

  let status: ClearanceStatus;
  if (exception?.status === 'approved') status = 'exception_approved';
  else if (exception?.status === 'requested') status = 'exception_requested';
  else if (requiredBeforeEntry === 0 || missing <= 0) status = 'cleared';
  else if (paid > 0) status = 'partially_cleared';
  else status = 'blocked';

  return { requiredBeforeEntry, paid: Math.max(0, paid), missing, missingItems, status };
}

export interface ClearanceRow {
  studentId: number; name: string; admissionNo: string | null; className: string | null;
  requiredBeforeEntry: number; paid: number; missing: number; status: ClearanceStatus; missingItems: string[];
  exceptionId: number | null;
}

const CLEARANCE_SELECT = `
  SELECT s.id, e.class_id, e.stream_id, e.program_id, e.term_id, e.academic_year_id, e.enrollment_type,
         c.class_level, p.gender, sm.name AS study_mode,
         s.admission_no, CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) AS full_name, c.name AS class_name
    FROM students s
    JOIN enrollments e ON e.student_id = s.id AND e.status = 'active' AND e.school_id = s.school_id
    LEFT JOIN classes c ON c.id = e.class_id
    LEFT JOIN people p ON p.id = s.person_id
    LEFT JOIN study_modes sm ON sm.id = e.study_mode_id`;

/** Entry-clearance status for every active learner (optionally one class). */
export async function loadClearance(schoolId: number, termId: number, classId?: number | null): Promise<ClearanceRow[]> {
  const { getBalancesForStudents } = await import('@/lib/services/FinanceLedger');
  const rows = (await query(
    `${CLEARANCE_SELECT} WHERE s.school_id = ? AND s.status = 'active' ${classId ? 'AND e.class_id = ?' : ''}`,
    classId ? [schoolId, classId] : [schoolId],
  )) as any[];
  const items = (await query(`SELECT * FROM fee_items WHERE school_id = ? AND is_active = 1`, [schoolId])) as any[];
  const rules = (await query(`SELECT * FROM fee_eligibility_rules WHERE school_id = ? AND is_active = 1`, [schoolId])) as any[];
  const byItem = new Map<number, any[]>();
  for (const r of rules) { const a = byItem.get(r.fee_item_id) || []; a.push(r); byItem.set(r.fee_item_id, a); }

  const studentIds = [...new Set(rows.map((r) => Number(r.id)))];
  const balances = studentIds.length ? await getBalancesForStudents(studentIds, schoolId) : new Map();
  const adj = await loadAdjustmentsByStudent(schoolId, studentIds, termId);
  const exByStudent = new Map<number, any>();
  if (studentIds.length) {
    const exRows = (await query(
      `SELECT * FROM fee_clearance_exceptions WHERE school_id = ? AND (term_id = ? OR term_id IS NULL)
         AND student_id IN (${studentIds.map(() => '?').join(',')}) ORDER BY id DESC`,
      [schoolId, termId, ...studentIds],
    )) as any[];
    for (const e of exRows) if (!exByStudent.has(Number(e.student_id))) exByStudent.set(Number(e.student_id), e);
  }

  // Merge each learner's lines across their active enrollments (dedup by name).
  const byStudent = new Map<number, { row: any; lines: BillLine[]; names: Set<string> }>();
  for (const r of rows) {
    const ctx = rowToCtx(r, termId);
    const { lines } = evaluateBill(items, byItem, ctx, adj.get(ctx.studentId));
    const cur = byStudent.get(ctx.studentId) || { row: r, lines: [], names: new Set<string>() };
    for (const l of lines) if (!cur.names.has(l.name)) { cur.names.add(l.name); cur.lines.push(l); }
    byStudent.set(ctx.studentId, cur);
  }

  const out: ClearanceRow[] = [];
  for (const [sid, v] of byStudent) {
    if (!v.lines.length) continue;
    const paid = Number((balances.get(sid) as any)?.total_paid || 0);
    const ex = exByStudent.get(sid);
    const cl = computeClearance(v.lines, paid, ex);
    out.push({ studentId: sid, name: (v.row.full_name || '').trim() || String(sid), admissionNo: v.row.admission_no, className: v.row.class_name, exceptionId: ex ? Number(ex.id) : null, ...cl });
  }
  return out;
}

export async function requestClearanceException(schoolId: number, b: any, userId?: number | null): Promise<number> {
  const res = (await query(
    `INSERT INTO fee_clearance_exceptions (school_id, student_id, term_id, academic_year_id, status, reason, requested_by)
     VALUES (?, ?, ?, ?, 'requested', ?, ?)`,
    [schoolId, b.student_id, b.term_id ?? null, b.academic_year_id ?? null, b.reason ?? null, userId ?? null],
  )) as unknown as { insertId: number };
  return res.insertId;
}

export async function setClearanceExceptionStatus(
  schoolId: number, id: number, status: 'approved' | 'rejected' | 'blocked', userId?: number | null,
): Promise<void> {
  if (status === 'approved') {
    await query(`UPDATE fee_clearance_exceptions SET status='approved', approved_by=?, approved_at=CURRENT_TIMESTAMP WHERE id=? AND school_id=?`, [userId ?? null, id, schoolId]);
  } else {
    await query(`UPDATE fee_clearance_exceptions SET status=? WHERE id=? AND school_id=?`, [status, id, schoolId]);
  }
}

// ── Payment-channel enforcement (Phase 6) ──

/** Map a payment method (cash/bank_transfer/mpesa/…) to a fee_items channel. */
export function methodToChannel(method?: string | null): string {
  switch ((method || '').toLowerCase()) {
    case 'cash': return 'cash';
    case 'bank_transfer': case 'cheque': case 'card': return 'bank';
    case 'mpesa': case 'airtel': return 'mobile_money';
    case 'school_code': return 'school_code';
    default: return 'any';
  }
}

/**
 * PURE: is a payment method allowed for a fee item's required channel?
 *   item channel 'any'         → any method
 *   item channel 'school_code' → only the school-code channel
 *   item channel 'cash'        → cash
 *   item channel 'bank'        → bank-type methods (transfer/cheque/card/school_code)
 *   item channel 'mobile_money'→ mpesa/airtel
 * Returns { ok, reason }.
 */
export function isChannelAllowed(itemChannel: string | null | undefined, method: string | null | undefined): { ok: boolean; reason?: string } {
  const want = (itemChannel || 'any').toLowerCase();
  if (want === 'any') return { ok: true };
  const ch = methodToChannel(method);
  if (want === 'bank' && ch === 'school_code') return { ok: true }; // school code is a bank channel
  if (ch === want) return { ok: true };
  return { ok: false, reason: `This fee must be paid via ${want.replace('_', ' ')}` };
}

export async function listClearanceExceptions(schoolId: number, status?: string) {
  const sql = `SELECT e.*, CONCAT(COALESCE(p.first_name,''),' ',COALESCE(p.last_name,'')) AS student_name
                 FROM fee_clearance_exceptions e
                 JOIN students s ON s.id = e.student_id
                 LEFT JOIN people p ON p.id = s.person_id
                WHERE e.school_id = ?${status ? ' AND e.status = ?' : ''}
                ORDER BY e.id DESC`;
  return query(sql, status ? [schoolId, status] : [schoolId]) as Promise<any[]>;
}
