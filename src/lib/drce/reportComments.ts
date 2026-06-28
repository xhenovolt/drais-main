/**
 * Report comment rules engine (Founder-Independence Phase 4).
 *
 * Schools define result-table comments from the UI; `resolveComment` picks the
 * best comment for a result row. A rule matches when every SET condition matches
 * (NULL = don't care). The most SPECIFIC active rule wins (most conditions set),
 * ties broken by lowest `priority`. Pure + unit-testable.
 */
import { query } from '@/lib/db';

export interface CommentRule {
  id?: number;
  scope?: string;
  subject_id?: number | null;
  class_id?: number | null;
  program_id?: number | null;
  grade_code?: string | null;
  min_score?: number | null;
  max_score?: number | null;
  competency_level?: string | null;
  comment_text: string;
  language?: string | null;
  priority?: number | null;
  is_active?: number | boolean | null;
}

export interface ResultCtx {
  subjectId?: number | null;
  classId?: number | null;
  programId?: number | null;
  grade?: string | null;
  score?: number | null;
  competencyLevel?: string | null;
  language?: string | null;
}

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** How many conditions a rule sets (higher = more specific). */
function specificity(r: CommentRule): number {
  let n = 0;
  if (r.subject_id != null) n++;
  if (r.class_id != null) n++;
  if (r.program_id != null) n++;
  if (r.grade_code) n++;
  if (r.min_score != null || r.max_score != null) n++;
  if (r.competency_level) n++;
  return n;
}

function matches(r: CommentRule, ctx: ResultCtx): boolean {
  if (r.is_active === 0 || r.is_active === false) return false;
  if (r.language && ctx.language && norm(r.language) !== norm(ctx.language)) return false;
  if (r.subject_id != null && r.subject_id !== ctx.subjectId) return false;
  if (r.class_id != null && r.class_id !== ctx.classId) return false;
  if (r.program_id != null && r.program_id !== ctx.programId) return false;
  if (r.grade_code && norm(r.grade_code) !== norm(ctx.grade)) return false;
  if (r.competency_level && norm(r.competency_level) !== norm(ctx.competencyLevel)) return false;
  if (r.min_score != null || r.max_score != null) {
    if (ctx.score == null) return false;
    if (r.min_score != null && Number(ctx.score) < Number(r.min_score)) return false;
    if (r.max_score != null && Number(ctx.score) > Number(r.max_score)) return false;
  }
  return true;
}

/** PURE: choose the best comment text for a result (or '' if none). */
export function resolveComment(rules: CommentRule[], ctx: ResultCtx): { text: string; rule: CommentRule | null } {
  const candidates = rules.filter((r) => matches(r, ctx));
  if (!candidates.length) return { text: '', rule: null };
  candidates.sort((a, b) =>
    specificity(b) - specificity(a) ||
    Number(a.priority ?? 100) - Number(b.priority ?? 100) ||
    Number(b.id ?? 0) - Number(a.id ?? 0),
  );
  return { text: candidates[0].comment_text, rule: candidates[0] };
}

// ── CRUD ──
export async function listCommentRules(schoolId: number) {
  return query(
    `SELECT * FROM report_comment_rules WHERE school_id = ? ORDER BY is_active DESC, priority ASC, id DESC`,
    [schoolId],
  ) as Promise<any[]>;
}

export async function createCommentRule(schoolId: number, b: CommentRule, userId?: number | null): Promise<number> {
  const res = (await query(
    `INSERT INTO report_comment_rules
       (school_id, scope, subject_id, class_id, program_id, grade_code, min_score, max_score,
        competency_level, comment_text, language, priority, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, b.scope ?? 'global', b.subject_id ?? null, b.class_id ?? null, b.program_id ?? null,
     b.grade_code || null, b.min_score ?? null, b.max_score ?? null, b.competency_level || null,
     b.comment_text, b.language || 'en', b.priority ?? 100, b.is_active === false ? 0 : 1, userId ?? null],
  )) as unknown as { insertId: number };
  return res.insertId;
}

export async function updateCommentRule(schoolId: number, id: number, b: Partial<CommentRule>): Promise<void> {
  const cols = ['scope', 'subject_id', 'class_id', 'program_id', 'grade_code', 'min_score', 'max_score', 'competency_level', 'comment_text', 'language', 'priority', 'is_active'];
  const sets: string[] = []; const params: any[] = [];
  for (const c of cols) if ((b as any)[c] !== undefined) {
    sets.push(`${c} = ?`);
    params.push(c === 'is_active' ? ((b as any)[c] ? 1 : 0) : ((b as any)[c] === '' ? null : (b as any)[c]));
  }
  if (!sets.length) return;
  params.push(id, schoolId);
  await query(`UPDATE report_comment_rules SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`, params);
}

export async function deleteCommentRule(schoolId: number, id: number): Promise<void> {
  await query(`DELETE FROM report_comment_rules WHERE id = ? AND school_id = ?`, [id, schoolId]);
}
