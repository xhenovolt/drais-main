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
        mandatory, optional, is_active, effective_from, effective_to, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, b.name, b.code ?? null, b.category ?? 'other', Number(b.default_amount) || 0,
     b.currency ?? 'UGX', b.frequency ?? 'termly', b.mandatory ? 1 : 0, b.optional ? 1 : 0,
     b.is_active === false ? 0 : 1, b.effective_from ?? null, b.effective_to ?? null, b.notes ?? null, userId ?? null],
  )) as unknown as { insertId: number };
  return res.insertId;
}
export async function updateFeeItem(schoolId: number, id: number, b: any): Promise<void> {
  const cols = ['name', 'code', 'category', 'default_amount', 'currency', 'frequency', 'mandatory', 'optional', 'is_active', 'effective_from', 'effective_to', 'notes'];
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
        gender, boarding, stream_id, program_id, is_candidate, term_id, academic_year_id, amount, priority, is_active, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, b.fee_item_id, b.name ?? null, b.applies_to ?? 'segment',
     b.class_ids ? JSON.stringify(b.class_ids) : null, b.level_min ?? null, b.level_max ?? null,
     b.gender ?? null, b.boarding ?? null, b.stream_id ?? null, b.program_id ?? null,
     b.is_candidate ? 1 : null, b.term_id ?? null, b.academic_year_id ?? null,
     b.amount != null && b.amount !== '' ? Number(b.amount) : null, b.priority ?? 100,
     b.is_active === false ? 0 : 1, b.notes ?? null, userId ?? null],
  )) as unknown as { insertId: number };
  return res.insertId;
}
export async function deleteRule(schoolId: number, id: number): Promise<void> {
  await query(`DELETE FROM fee_eligibility_rules WHERE id = ? AND school_id = ?`, [id, schoolId]);
}
