/**
 * P2 — Conditional Visibility Engine.
 *
 * Pure rule tree + evaluator used by the renderer to decide whether a
 * section renders for a given DRCEDataContext. Rules live in the document
 * (sectional `visibilityRule`) and evaluate per-student at render time, so
 * the same document yields different output for different learners without
 * any duplication of templates.
 *
 * Examples a school admin can build entirely from the UI:
 *   visible when student.custom.religion == "Islam"
 *   visible when student.custom.is_boarding == true
 *   visible when assessment.classPosition <= 5
 *   visible when (student.gender == "F" AND student.className contains "S6")
 *
 * Determinism: evaluate(rule, ctx) is a pure function — no I/O, no clock,
 * no fetch. Same inputs → same boolean.
 */
import type { DRCEDataContext } from './schema';
import { getByPath } from './bindingResolver';

// ─── Rule tree ──────────────────────────────────────────────────────────────

/** Leaf node: compare a left operand against a right operand using `op`. */
export interface RuleLeaf {
  kind:  'compare';
  /** Binding path into DRCEDataContext (e.g. `student.custom.bus_route`,
   *  `assessment.classPosition`, `student.gender`). */
  left:  string;
  op:    CompareOp;
  /** Right operand. `kind: 'literal'` is a constant; `kind: 'binding'` reads
   *  another path from dataCtx so rules like "a == b" work. */
  right?: { kind: 'literal'; value: RuleLiteral } | { kind: 'binding'; path: string };
}

export type CompareOp =
  | '==' | '!=' | '>' | '>=' | '<' | '<='
  | 'contains' | 'not_contains'
  | 'starts_with' | 'ends_with'
  | 'in' | 'not_in'         // right.value is an array
  | 'between'               // right.value is [min, max], inclusive
  | 'empty' | 'not_empty';  // unary — right is ignored

export type RuleLiteral = string | number | boolean | null | Array<string | number>;

/** Group node: combine multiple children with AND / OR. */
export interface RuleGroup {
  kind:     'group';
  op:       'AND' | 'OR';
  children: VisibilityRule[];
  /** If true, the result is inverted (NOT). Lets `(A AND B) NOT` work
   *  without a separate NOT node type. */
  negate?:  boolean;
}

export type VisibilityRule = RuleLeaf | RuleGroup;

// ─── Evaluator ──────────────────────────────────────────────────────────────

/**
 * Evaluate a rule against a data context. Returns true if the section should
 * render. A null / undefined / empty rule is treated as "always visible" so
 * legacy sections stay rendered.
 */
export function evaluateRule(rule: VisibilityRule | null | undefined, ctx: DRCEDataContext): boolean {
  return evaluateRuleTree(rule, (path) => resolvePath(path, ctx));
}

function resolvePath(path: string, ctx: DRCEDataContext): unknown {
  // Mirror bindingResolver's root shape — keep aliases consistent with the
  // rest of DRCE so a binding that works in `{student.custom.x}` works here.
  const root = {
    student:    ctx.student,
    subjects:   ctx.subjects,
    results:    ctx.results,
    assessment: ctx.assessment,
    comments:   ctx.comments,
    meta:       ctx.meta,
  } as Record<string, unknown>;
  return getByPath(root, path.trim());
}

/**
 * Generic rule-tree evaluator, decoupled from DRCEDataContext. Any caller
 * that has its own flat data shape (e.g. the comment engine's per-student
 * academic summary) supplies its own `resolve(path)` function and reuses this
 * exact AND/OR/nested/negate/operator semantics — one proven implementation,
 * two binding roots. `evaluateRule` above is the DRCEDataContext-bound
 * specialization used by section visibility.
 */
export function evaluateRuleTree(
  rule: VisibilityRule | null | undefined,
  resolve: (path: string) => unknown,
): boolean {
  if (!rule) return true;
  if (rule.kind === 'group') {
    const kids = rule.children ?? [];
    if (!kids.length) return true;
    let result: boolean;
    if (rule.op === 'OR') result = kids.some(c => evaluateRuleTree(c, resolve));
    else                  result = kids.every(c => evaluateRuleTree(c, resolve));
    return rule.negate ? !result : result;
  }
  return evaluateLeafTree(rule, resolve);
}

function evaluateLeafTree(leaf: RuleLeaf, resolve: (path: string) => unknown): boolean {
  const left = resolve(leaf.left);
  const op = leaf.op;

  if (op === 'empty')     return isEmpty(left);
  if (op === 'not_empty') return !isEmpty(left);

  const rightRaw =
    leaf.right == null
      ? undefined
      : leaf.right.kind === 'literal'
        ? leaf.right.value
        : resolve(leaf.right.path);

  switch (op) {
    case '==':           return looseEq(left, rightRaw);
    case '!=':           return !looseEq(left, rightRaw);
    case '>':            return numCmp(left, rightRaw, (a, b) => a >  b);
    case '>=':           return numCmp(left, rightRaw, (a, b) => a >= b);
    case '<':            return numCmp(left, rightRaw, (a, b) => a <  b);
    case '<=':           return numCmp(left, rightRaw, (a, b) => a <= b);
    case 'contains':     return strCmp(left, rightRaw, (a, b) => a.includes(b));
    case 'not_contains': return strCmp(left, rightRaw, (a, b) => !a.includes(b));
    case 'starts_with':  return strCmp(left, rightRaw, (a, b) => a.startsWith(b));
    case 'ends_with':    return strCmp(left, rightRaw, (a, b) => a.endsWith(b));
    case 'in':           return inList(left, rightRaw);
    case 'not_in':       return !inList(left, rightRaw);
    case 'between':      return betweenCmp(left, rightRaw);
    default:             return true;
  }
}

function betweenCmp(a: unknown, range: unknown): boolean {
  if (!Array.isArray(range) || range.length !== 2) return false;
  const na = typeof a === 'number' ? a : parseFloat(String(a));
  const lo = Number(range[0]), hi = Number(range[1]);
  if (!Number.isFinite(na) || !Number.isFinite(lo) || !Number.isFinite(hi)) return false;
  return na >= Math.min(lo, hi) && na <= Math.max(lo, hi);
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v))       return v.length === 0;
  if (typeof v === 'object')  return Object.keys(v as object).length === 0;
  return false;
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' || typeof b === 'number') {
    const na = Number(a), nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  }
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Boolean(a) === Boolean(b);
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function numCmp(a: unknown, b: unknown, fn: (x: number, y: number) => boolean): boolean {
  const na = typeof a === 'number' ? a : parseFloat(String(a));
  const nb = typeof b === 'number' ? b : parseFloat(String(b));
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return false;
  return fn(na, nb);
}

function strCmp(a: unknown, b: unknown, fn: (x: string, y: string) => boolean): boolean {
  const sa = String(a ?? '').toLowerCase();
  const sb = String(b ?? '').toLowerCase();
  if (sb === '') return false;
  return fn(sa, sb);
}

function inList(value: unknown, list: unknown): boolean {
  if (!Array.isArray(list)) return false;
  for (const item of list) if (looseEq(value, item)) return true;
  return false;
}

// ─── Helpers for the editor ─────────────────────────────────────────────────

/** Human-readable summary for the visibility chip in the editor list. */
export function describeRule(rule: VisibilityRule | null | undefined): string {
  if (!rule) return 'Always visible';
  if (rule.kind === 'group') {
    const inner = (rule.children ?? []).map(describeRule).join(` ${rule.op} `);
    const wrapped = (rule.children?.length ?? 0) > 1 ? `(${inner})` : inner;
    return rule.negate ? `NOT ${wrapped}` : wrapped;
  }
  const right = leafRightDescription(rule);
  return `${rule.left} ${rule.op}${right ? ` ${right}` : ''}`;
}

function leafRightDescription(leaf: RuleLeaf): string {
  if (leaf.op === 'empty' || leaf.op === 'not_empty') return '';
  if (!leaf.right) return '∅';
  if (leaf.right.kind === 'literal') {
    const v = leaf.right.value;
    if (Array.isArray(v)) return `[${v.join(', ')}]`;
    if (typeof v === 'string') return `"${v}"`;
    return String(v);
  }
  return `{${leaf.right.path}}`;
}

/** Sentinel for "new empty rule" so editors can hand the user a starting tree. */
export function emptyRule(): RuleGroup {
  return { kind: 'group', op: 'AND', children: [] };
}

export function blankLeaf(): RuleLeaf {
  return { kind: 'compare', left: '', op: '==', right: { kind: 'literal', value: '' } };
}
