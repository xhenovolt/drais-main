/**
 * DRCE expression aggregations — Phase G.
 *
 *   {sum(results, "score")}
 *   {avg(results, "score") | number:"#,##0.0"}
 *   {count(subjects)}
 *   {min(results, "score")}
 *   {max(results, "score")}
 *   {passed(results, "score", 50)}
 *   {failed(results, "score", 50)}
 *
 * Each aggregator is a PURE function of the data context plus literal/path
 * arguments. No side effects, no I/O, no `Date.now()`. The grammar stays
 * closed — only the registered aggregator names are callable; arbitrary
 * function calls are NOT permitted (no sandboxing risk).
 */
import type { DRCEDataContext } from '../schema';
import { getByPath } from '../bindingResolver';

export type AggregatorArg = string | number | boolean | null;

export type Aggregator = (
  ctx:  DRCEDataContext,
  args: AggregatorArg[],
) => string | number | boolean | null;

const REGISTRY = new Map<string, Aggregator>();

export function registerAggregator(name: string, fn: Aggregator): void {
  REGISTRY.set(name, fn);
}

export function getAggregator(name: string): Aggregator | undefined {
  return REGISTRY.get(name);
}

export function listAggregators(): string[] {
  return [...REGISTRY.keys()].sort();
}

// ── Helpers ────────────────────────────────────────────────────────────────

function rootOf(ctx: DRCEDataContext): Record<string, unknown> {
  return {
    student:    ctx.student,
    subjects:   ctx.subjects,
    results:    ctx.results,
    assessment: ctx.assessment,
    comments:   ctx.comments,
    meta:       ctx.meta,
  };
}

/** Resolve an aggregator's first argument to an array (collection path). */
function resolveCollection(ctx: DRCEDataContext, arg: AggregatorArg): unknown[] {
  if (typeof arg !== 'string' || !arg.trim()) return [];
  const v = getByPath(rootOf(ctx), arg.trim());
  return Array.isArray(v) ? v : [];
}

function numericField(item: unknown, fieldName: string | undefined): number | null {
  if (item == null) return null;
  let v: unknown;
  if (fieldName && typeof item === 'object') {
    v = (item as Record<string, unknown>)[fieldName];
  } else if (!fieldName) {
    v = item;
  }
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function numbersFrom(coll: unknown[], field?: string): number[] {
  const out: number[] = [];
  for (const it of coll) {
    const n = numericField(it, field);
    if (n !== null) out.push(n);
  }
  return out;
}

// ── Built-in aggregators ───────────────────────────────────────────────────

registerAggregator('count', (ctx, [coll]) => resolveCollection(ctx, coll).length);

registerAggregator('sum', (ctx, [coll, field]) => {
  const ns = numbersFrom(resolveCollection(ctx, coll), typeof field === 'string' ? field : undefined);
  return ns.reduce((a, b) => a + b, 0);
});

registerAggregator('avg', (ctx, [coll, field]) => {
  const ns = numbersFrom(resolveCollection(ctx, coll), typeof field === 'string' ? field : undefined);
  if (!ns.length) return null;
  return Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 100) / 100;
});

registerAggregator('min', (ctx, [coll, field]) => {
  const ns = numbersFrom(resolveCollection(ctx, coll), typeof field === 'string' ? field : undefined);
  return ns.length ? Math.min(...ns) : null;
});

registerAggregator('max', (ctx, [coll, field]) => {
  const ns = numbersFrom(resolveCollection(ctx, coll), typeof field === 'string' ? field : undefined);
  return ns.length ? Math.max(...ns) : null;
});

registerAggregator('passed', (ctx, [coll, field, threshold]) => {
  const cutoff = typeof threshold === 'number' ? threshold : 50;
  const ns = numbersFrom(resolveCollection(ctx, coll), typeof field === 'string' ? field : 'score');
  return ns.filter(n => n >= cutoff).length;
});

registerAggregator('failed', (ctx, [coll, field, threshold]) => {
  const cutoff = typeof threshold === 'number' ? threshold : 50;
  const ns = numbersFrom(resolveCollection(ctx, coll), typeof field === 'string' ? field : 'score');
  return ns.filter(n => n < cutoff).length;
});

/** Test-only. */
export function __clearAggregators(): void { REGISTRY.clear(); }
