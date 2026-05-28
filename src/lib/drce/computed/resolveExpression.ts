/**
 * Unified DRCE expression resolver — Phase A.
 *
 *   {student.fullName}                         path
 *   {next_term_begins}                         computed
 *   {next_term_begins | date:"D MMM YYYY"}     formatter pipe
 *   {comments.classTeacher | coalesce:"—"}     fallback
 *   {if year_rollover then "Next year" else next_term_name}
 *
 * A strict SUPERSET of the legacy `resolveToken` / `resolveBinding` syntax.
 * Existing `{path}` placeholders continue to work unchanged. The grammar is
 * deliberately small and closed — no arbitrary arithmetic, no
 * sub-expressions in conditionals beyond computed/path/literal — so the
 * resolver stays pure, sandbox-free, and deterministic.
 *
 * Tenant safety: this is a pure function of (text, ctx). Inputs are caller
 * responsibility. No I/O, no Date.now() inside.
 */
import type { DRCEDataContext } from '../schema';
import { getByPath } from '../bindingResolver';
import { getComputed, type ComputedValue } from './registry';
import { applyFormatter } from './formatters';
// Side-effect import: registers built-in computeds at module load.
import './builtins';

type RootScope = Record<string, unknown>;

function rootFor(ctx: DRCEDataContext, row?: Record<string, unknown>): RootScope {
  return {
    student:    ctx.student,
    subjects:   ctx.subjects,
    results:   ctx.results,
    assessment: ctx.assessment,
    comments:   ctx.comments,
    meta:       ctx.meta,
    school:     ctx.meta,           // alias so {school.schoolName} reads naturally
    ...(row ? { result: row } : {}),
  };
}

/**
 * Resolve a single expression body (the text inside `{…}`) to a value.
 * Returns null if the head term is unknown — caller decides how to render.
 */
function resolveSingleTerm(term: string, ctx: DRCEDataContext, row?: Record<string, unknown>): ComputedValue {
  const trimmed = term.trim();
  if (!trimmed) return null;

  // String literal
  if ((trimmed.startsWith('"') && trimmed.endsWith('"'))
   || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  // Numeric literal
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  // Boolean literal
  if (trimmed === 'true')  return true;
  if (trimmed === 'false') return false;

  // Computed field — checked before paths so a school can shadow a deep path
  // with a stable computed name (we never overwrite the built-ins silently).
  const comp = getComputed(trimmed);
  if (comp) return comp.compute(ctx);

  // Dot-path fallback
  const v = getByPath(rootFor(ctx, row), trimmed);
  if (v === undefined || v === null) return null;
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v instanceof Date) return v;
  // Render objects as JSON only as a last resort.
  return String(v);
}

/** Tokenize a formatter pipe argument list: `date:"D MMM YYYY"` → ['date', ['"D MMM YYYY"']]. */
function parseFormatter(pipe: string): { name: string; args: string[] } | null {
  const colon = pipe.indexOf(':');
  if (colon < 0) return { name: pipe.trim(), args: [] };
  const name = pipe.slice(0, colon).trim();
  const rest = pipe.slice(colon + 1).trim();
  // Split args by comma, but keep quoted segments intact.
  const args: string[] = [];
  let buf = '', inStr: '"' | "'" | null = null;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (inStr) { buf += ch; if (ch === inStr) inStr = null; continue; }
    if (ch === '"' || ch === "'") { inStr = ch; buf += ch; continue; }
    if (ch === ',') { args.push(buf.trim()); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) args.push(buf.trim());
  return { name, args };
}

const COND_RE = /^if\s+(.+?)\s+then\s+(.+?)\s+else\s+(.+)$/i;

function isTruthy(v: ComputedValue): boolean {
  if (v == null) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number')  return v !== 0;
  if (v instanceof Date)      return !isNaN(v.getTime());
  return String(v).trim() !== '';
}

/** Resolve one expression body to its final rendered string. */
function resolveBody(body: string, ctx: DRCEDataContext, row?: Record<string, unknown>): string {
  // Conditional `if X then A else B`
  const m = body.trim().match(COND_RE);
  if (m) {
    const cond  = resolveSingleTerm(m[1], ctx, row);
    const chosen = isTruthy(cond) ? m[2] : m[3];
    return resolveBody(chosen, ctx, row);   // chosen branch can be a path, literal, or another pipe expression
  }

  // Pipe pipeline: head | formatter1:args | formatter2:args
  const parts = body.split('|').map(p => p.trim());
  let value: ComputedValue = resolveSingleTerm(parts[0], ctx, row);

  for (let i = 1; i < parts.length; i++) {
    const f = parseFormatter(parts[i]);
    if (!f) continue;
    value = applyFormatter(value, f.name, f.args);
  }

  if (value == null) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Replace every `{...}` in `text` with its resolved value.
 * Unknown computed/path expressions render as empty strings — the legacy
 * `resolveToken` left them as the literal `{...}`; the new resolver mirrors
 * the legacy fallback when there is no inner pipe/conditional, otherwise
 * collapses to empty so formatter pipes don't leak braces.
 */
export function resolveExpression(text: string, ctx: DRCEDataContext, row?: Record<string, unknown>): string {
  if (!text || text.indexOf('{') < 0) return text;
  return text.replace(/\{([^{}]+)\}/g, (match, body: string) => {
    // Preserve legacy behavior for simple unknown paths: leave the brace
    // form intact so existing templates don't suddenly produce blank cells.
    if (!body.includes('|') && !COND_RE.test(body)) {
      const v = resolveSingleTerm(body, ctx, row);
      if (v == null) return match;            // unknown → leave `{path}` as-is
      if (v instanceof Date) return v.toISOString();
      return String(v);
    }
    return resolveBody(body, ctx, row);
  });
}
