/**
 * Intelligent Report Comment Engine (Report Engine Patch Program, Phase II).
 *
 * Replaces the static, identical-for-every-learner overall comments
 * (Class Teacher / DOS / Headteacher — see the old `defaultComments()` in
 * snapshots/grader.ts) with school-configurable, performance-driven rules.
 *
 * Reuses the exact AND/OR/nested/negate rule-tree semantics already proven in
 * src/lib/drce/visibility.ts (`evaluateRuleTree`) — one evaluator, a second
 * binding root (`CommentResolutionCtx`, a flat academic-summary shape rather
 * than the full DRCEDataContext, since resolution happens at SNAPSHOT
 * GENERATION time, before a render context exists).
 *
 * Resolution is deterministic and pure GIVEN a rule set + ctx: same rules +
 * same ctx -> same text, every time.
 *
 * Resolution happens TWICE, deliberately:
 *  1. At snapshot generation (src/lib/snapshots/generator.ts), using ALL of
 *     the school's rules (template-unaware) — this frozen value is the
 *     fallback/default baseline, matching the immutability invariant for
 *     every other snapshot field.
 *  2. At render/print time (src/lib/snapshots/print-state.ts), using only
 *     the rules scoped to the ACTUAL template being rendered (ruleId's
 *     `templateId` null-or-match), with the frozen value from (1) as the
 *     fallback if none match. This is a DELIBERATE, DOCUMENTED EXCEPTION to
 *     RENDER_LAYERS.md's "render is pure, no I/O" / "snapshot reproduces the
 *     same bytes" invariants — see RENDER_LAYERS.md's "Overall-comment
 *     resolution" section for the tradeoff this accepts: reprinting the same
 *     report card can show different overall-comment wording if the
 *     school's comment bank changes between prints. Every other field on
 *     the report remains fully frozen/immutable as before.
 */
import { evaluateRuleTree, type VisibilityRule } from './visibility';
import { getByPath } from './bindingResolver';

/** Overall-comment role this rule applies to. 'custom' allows schools to
 *  define additional named roles (e.g. "Academic Registrar remark") beyond
 *  the three built-in ones, rendered wherever a template binds to them. */
export type CommentRole = 'classTeacher' | 'dos' | 'headTeacher' | 'custom';

export interface CommentBankRule {
  id?: number;
  schoolId?: number;
  role: CommentRole;
  /** Null/undefined = applies to every template. Set = only considered when
   *  resolving comments for that specific dvcf_documents id, so a school can
   *  give different templates different comment logic without duplicating
   *  or reconfiguring the whole rule set each time they switch templates. */
  templateId?: number | null;
  /** Required when role === 'custom' — the binding key under comments.custom.<key>. */
  customKey?: string | null;
  /** 'replace' rules compete for the BASE text (highest priority match wins).
   *  'append' rules add extra sentences onto whatever base was chosen,
   *  independently of which replace rule matched — this is how "Division I"
   *  or "Attendance below 80%" additions work regardless of the base band. */
  mode: 'replace' | 'append';
  /** Null condition = always matches. Used for the ultimate fallback
   *  ('replace' rule with the lowest priority) and for append rules that
   *  should always fire (rare, but valid). */
  condition: VisibilityRule | null;
  commentText: string;
  commentTextAr?: string | null;
  /** Lower number = evaluated first among same-mode candidates. */
  priority: number;
  isActive: boolean;
}

/** Flat academic-summary context resolution binds against. Deliberately NOT
 *  the full DRCEDataContext — this is built directly from values already
 *  computed during snapshot generation, before results/render.ts. */
export interface CommentResolutionCtx {
  average: number;
  total: number;
  totalPossible: number;
  percentage: number;
  position: number | null;
  totalInClass: number | null;
  aggregate: number | null;
  division: string | null;
  overallGrade: string | null;
  subjects: Array<{ id: number; name: string; score: number | null; grade: string | null }>;
  /** Reserved for future wiring (not yet populated by the generator — see
   *  Phase II audit note). Rules can be authored against these paths today;
   *  they simply won't match until the data pipeline supplies them. */
  attendancePercent?: number | null;
  behaviourScore?: number | null;
  promotionStatus?: string | null;
}

/** Field catalogue for the comment-rule condition editor (fed to
 *  VisibilityRuleEditor's `bindings` override). Matches CommentResolutionCtx's
 *  flat paths exactly — this is a DIFFERENT, smaller binding root than the
 *  DRCEDataContext catalogue used by section-visibility rules. Reserved
 *  fields (attendance/behaviour/promotion) are included so schools can author
 *  rules against them today; they resolve to undefined until the generator's
 *  data pipeline supplies that data (see Phase II audit note). */
export const COMMENT_FIELD_BINDINGS: Array<{ group: string; binding: string; label: string }> = [
  { group: 'Academic standing', binding: 'average',      label: 'Average score' },
  { group: 'Academic standing', binding: 'percentage',   label: 'Percentage' },
  { group: 'Academic standing', binding: 'total',        label: 'Total marks obtained' },
  { group: 'Academic standing', binding: 'totalPossible', label: 'Total marks possible' },
  { group: 'Academic standing', binding: 'aggregate',    label: 'Aggregate' },
  { group: 'Academic standing', binding: 'division',     label: 'Division' },
  { group: 'Academic standing', binding: 'overallGrade', label: 'Overall grade' },
  { group: 'Ranking',           binding: 'position',      label: 'Class position (number)' },
  { group: 'Ranking',           binding: 'totalInClass',  label: 'Total students in class' },
  { group: 'Reserved (not yet wired)', binding: 'attendancePercent', label: 'Attendance %' },
  { group: 'Reserved (not yet wired)', binding: 'behaviourScore',    label: 'Behaviour score' },
  { group: 'Reserved (not yet wired)', binding: 'promotionStatus',   label: 'Promotion status' },
];

function resolveCommentPath(path: string, ctx: CommentResolutionCtx): unknown {
  return getByPath(ctx as unknown as Record<string, unknown>, path.trim());
}

/** PURE: evaluate one rule's condition against the resolution context. */
export function matchesCondition(rule: CommentBankRule, ctx: CommentResolutionCtx): boolean {
  if (!rule.isActive) return false;
  return evaluateRuleTree(rule.condition, (path) => resolveCommentPath(path, ctx));
}

export interface ResolvedComment {
  text: string;
  /** Rules that actually contributed (base + any applied appends), in the
   *  order applied — useful for an admin "why did this comment appear?" view. */
  appliedRuleIds: number[];
}

/**
 * PURE: resolve the final comment text for one role.
 *   1. Among 'replace' rules matching ctx, the lowest-priority match becomes
 *      the base text (ties broken by highest rule id — most recently added).
 *   2. Every matching 'append' rule (sorted by priority) has its text joined
 *      on afterward, regardless of which replace rule won.
 *   3. If NO replace rule matches (no rules configured, or none apply), the
 *      caller-supplied `fallback` is used as the base — this is what keeps
 *      existing schools' reports unchanged until they configure rules.
 */
export function resolveOverallComment(
  rules: CommentBankRule[],
  role: CommentRole,
  ctx: CommentResolutionCtx,
  options: { fallback?: string; language?: 'en' | 'ar'; customKey?: string } = {},
): ResolvedComment {
  const scoped = rules.filter((r) =>
    r.role === role && (role !== 'custom' || (r.customKey ?? '') === (options.customKey ?? '')));

  const replaceCandidates = scoped
    .filter((r) => r.mode === 'replace' && matchesCondition(r, ctx))
    .sort((a, b) => a.priority - b.priority || Number(b.id ?? 0) - Number(a.id ?? 0));

  const appendCandidates = scoped
    .filter((r) => r.mode === 'append' && matchesCondition(r, ctx))
    .sort((a, b) => a.priority - b.priority || Number(a.id ?? 0) - Number(b.id ?? 0));

  const pickText = (r: CommentBankRule) =>
    (options.language === 'ar' && r.commentTextAr ? r.commentTextAr : r.commentText);

  const base = replaceCandidates[0];
  const appliedRuleIds: number[] = [];
  let text = base ? pickText(base) : (options.fallback ?? '');
  if (base?.id != null) appliedRuleIds.push(base.id);

  for (const r of appendCandidates) {
    const t = pickText(r).trim();
    if (!t) continue;
    text = text ? `${text} ${t}` : t;
    if (r.id != null) appliedRuleIds.push(r.id);
  }

  return { text: text.trim(), appliedRuleIds };
}

/** Convenience wrapper resolving all three built-in roles at once — this is
 *  what snapshot generation calls per student. */
export function resolveAllOverallComments(
  rules: CommentBankRule[],
  ctx: CommentResolutionCtx,
  fallback: { classTeacher: string; dos: string; headTeacher: string },
  language: 'en' | 'ar' = 'en',
): { classTeacher: string; dos: string; headTeacher: string } {
  return {
    classTeacher: resolveOverallComment(rules, 'classTeacher', ctx, { fallback: fallback.classTeacher, language }).text,
    dos:          resolveOverallComment(rules, 'dos',          ctx, { fallback: fallback.dos,          language }).text,
    headTeacher:  resolveOverallComment(rules, 'headTeacher',  ctx, { fallback: fallback.headTeacher,  language }).text,
  };
}
