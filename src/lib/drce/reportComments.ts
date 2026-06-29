/**
 * Report comment rules engine (Founder-Independence Phase 4).
 *
 * Schools define result-table comments from the UI; `resolveComment` picks the
 * best comment for a result row. A rule matches when every SET condition matches
 * (NULL = don't care). The most SPECIFIC active rule wins (most conditions set),
 * ties broken by lowest `priority`. Pure + unit-testable.
 */
// NOTE: this module is imported by a CLIENT component (the live preview on
// /settings/report-comments), so it must stay free of server-only imports
// (no '@/lib/db'). DB CRUD lives in reportComments.server.ts.

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

// CRUD moved to reportComments.server.ts (server-only — imports mysql2).
