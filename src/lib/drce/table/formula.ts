/**
 * DRCE X4 — spreadsheet formula evaluator.
 *
 * Bridges `=SUM(B2:B12)` / `=AVG(A1:A5)` / `=IF(score >= 50, "Pass", "Fail")` /
 * `=COUNT(this.column)` into the existing expression engine.
 *
 * Grammar (deliberately closed):
 *   • leading `=` marks a formula cell
 *   • cell ref: `A1` (column letter + 1-based row), `B12`
 *   • range:   `A1:A5`, `B2:B12`
 *   • column-wise: `this.column` (current column, all rows)
 *   • row-wise:    `this.row` (current row, all cells)
 *   • functions: SUM / AVG / MIN / MAX / COUNT / IF
 *   • literals: numbers, strings (`"…"`), bool
 *   • path expressions (anything resolveExpression understands)
 *
 * Pure — no I/O, no React. Tests can call directly.
 */
import type { DRCEDataContext } from '../schema';
import { resolveExpression } from '../computed/resolveExpression';

export interface FormulaContext {
  /** All rendered cell values for the table — column-major then row. */
  cellValues: Record<string, Record<string, unknown>>;   // [columnId][rowKey]
  columnIds:  string[];                                  // left-to-right
  rowKeys:    string[];                                  // top-to-bottom
  /** Current cell coords (for `this.column` / `this.row`). */
  currentCol: string;
  currentRow: string;
  /** Outer data context for non-spreadsheet bindings. */
  dataCtx:    DRCEDataContext;
}

function colLetterToIndex(letter: string): number {
  // 'A' → 0, 'B' → 1 … 'Z' → 25, 'AA' → 26 …
  let n = 0;
  for (const c of letter.toUpperCase()) {
    if (c < 'A' || c > 'Z') return -1;
    n = n * 26 + (c.charCodeAt(0) - 64);
  }
  return n - 1;
}

function refToCoords(ref: string, ctx: FormulaContext): { col: string; row: string } | null {
  const m = ref.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) return null;
  const ci = colLetterToIndex(m[1]);
  const ri = parseInt(m[2], 10) - 1;
  const col = ctx.columnIds[ci];
  const row = ctx.rowKeys[ri];
  if (col == null || row == null) return null;
  return { col, row };
}

function rangeToCoords(range: string, ctx: FormulaContext): { col: string; row: string }[] {
  // 'this.column' — every row of the current column.
  if (range === 'this.column') return ctx.rowKeys.map(r => ({ col: ctx.currentCol, row: r }));
  // 'this.row' — every column of the current row.
  if (range === 'this.row')    return ctx.columnIds.map(c => ({ col: c, row: ctx.currentRow }));
  // `A1:A5` style.
  const m = range.match(/^([A-Za-z]+\d+):([A-Za-z]+\d+)$/);
  if (m) {
    const a = refToCoords(m[1], ctx);
    const b = refToCoords(m[2], ctx);
    if (!a || !b) return [];
    const ai = ctx.columnIds.indexOf(a.col), bi = ctx.columnIds.indexOf(b.col);
    const aj = ctx.rowKeys.indexOf(a.row),   bj = ctx.rowKeys.indexOf(b.row);
    const out: { col: string; row: string }[] = [];
    for (let ci = Math.min(ai, bi); ci <= Math.max(ai, bi); ci++) {
      for (let rj = Math.min(aj, bj); rj <= Math.max(aj, bj); rj++) {
        out.push({ col: ctx.columnIds[ci], row: ctx.rowKeys[rj] });
      }
    }
    return out;
  }
  // single ref
  const one = refToCoords(range, ctx);
  return one ? [one] : [];
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function readRefValue(ref: { col: string; row: string }, ctx: FormulaContext): unknown {
  return ctx.cellValues[ref.col]?.[ref.row];
}

function evalAggregator(name: string, args: string[], ctx: FormulaContext): string | number | boolean | null {
  if (!args.length) return null;
  const collect = (): number[] => {
    const out: number[] = [];
    for (const a of args) {
      const refs = rangeToCoords(a.trim(), ctx);
      for (const r of refs) {
        const n = asNumber(readRefValue(r, ctx));
        if (n !== null) out.push(n);
      }
    }
    return out;
  };
  const ns = collect();
  switch (name.toUpperCase()) {
    case 'SUM':   return ns.reduce((a, b) => a + b, 0);
    case 'AVG':
    case 'AVERAGE':
    case 'MEAN':  return ns.length ? Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 100) / 100 : null;
    case 'MIN':   return ns.length ? Math.min(...ns) : null;
    case 'MAX':   return ns.length ? Math.max(...ns) : null;
    case 'COUNT': return ns.length;
    default:      return null;
  }
}

/** Top-level entry point. Receives the formula body (without the leading `=`). */
export function evaluateFormula(body: string, ctx: FormulaContext): string {
  const t = body.trim();

  // SUM(...)/AVG(...)/MIN(...)/MAX(...)/COUNT(...)
  const aggMatch = t.match(/^(SUM|AVG|AVERAGE|MEAN|MIN|MAX|COUNT)\s*\(([^)]*)\)$/i);
  if (aggMatch) {
    const args = aggMatch[2].split(',').map(s => s.trim()).filter(Boolean);
    const v = evalAggregator(aggMatch[1], args, ctx);
    return v == null ? '' : String(v);
  }

  // IF(cond, a, b) — cond + branches resolved via the expression engine.
  const ifMatch = t.match(/^IF\s*\((.+)\)$/i);
  if (ifMatch) {
    const args = splitTopLevel(ifMatch[1]);
    if (args.length !== 3) return '';
    // Use resolveExpression's if/then/else so the cond can use computed fields.
    const expr = `{if ${args[0]} then ${args[1]} else ${args[2]}}`;
    return resolveExpression(expr, ctx.dataCtx);
  }

  // Single cell ref → just read the value.
  const refMatch = t.match(/^[A-Za-z]+\d+$/);
  if (refMatch) {
    const r = refToCoords(t, ctx);
    return r ? String(readRefValue(r, ctx) ?? '') : '';
  }

  // Fall back to the expression engine — supports paths, computeds, pipes.
  return resolveExpression(`{${t}}`, ctx.dataCtx);
}

/** Split `a, b, c` honouring nested parens and quoted strings. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0, inStr: '"' | "'" | null = null, buf = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      buf += c;
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") { inStr = c; buf += c; continue; }
    if (c === '(') { depth++; buf += c; continue; }
    if (c === ')') { depth--; buf += c; continue; }
    if (c === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue; }
    buf += c;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}
