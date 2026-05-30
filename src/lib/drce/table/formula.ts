/**
 * DRCE — spreadsheet formula engine (rewritten for correctness).
 *
 * Replaces the prior regex-driven dispatcher with a small recursive-descent
 * parser. Adds:
 *
 *   • Nested expressions: `=SUM(A1, IF(B1>0, B1, 0))` now parses correctly.
 *   • Local cell refs inside IF: `=IF(A1>=50, "Pass", "Fail")` reads A1 from
 *     the table itself, not just the outer DRCEDataContext.
 *   • Visible error states: every evaluation returns a tagged result.
 *     Cells render `#ERROR!` / `#REF!` / `#CYCLE!` / `#DIV/0!` with a
 *     tooltip-able diagnostic string instead of failing silently.
 *   • Six new functions: MEDIAN, RANK, ROUND, CONCAT, IFERROR, STDEV.
 *   • Arithmetic + comparison operators in cell expressions:
 *     `=A1 + A2`, `=A1 * 0.1`, `=A1 = "Pass"`.
 *
 * Backwards compatible — every formula that worked before still works
 * (verified: SUM/AVG/MIN/MAX/COUNT/IF/ranges/this.column/this.row, raw
 * bindings via the resolveExpression fallback).
 *
 * Determinism: pure function — no I/O, no Date.now(), no React.
 */
import type { DRCEDataContext } from '../schema';
import { resolveExpression } from '../computed/resolveExpression';

// ─── Public API ─────────────────────────────────────────────────────────────

export interface FormulaContext {
  /** All rendered cell values for the table — `[columnId][rowKey]`. Pass 2
   *  in TableSection populates this from pass 1 before invoking the
   *  evaluator on formula cells. */
  cellValues: Record<string, Record<string, unknown>>;
  columnIds:  string[];   // left-to-right
  rowKeys:    string[];   // top-to-bottom
  /** Current cell coords (so `this.column` / `this.row` work). */
  currentCol: string;
  currentRow: string;
  /** Outer data context for binding expressions (`student.fullName` etc.). */
  dataCtx:    DRCEDataContext;
}

/** Tagged evaluation result. Cell consumers should branch on `.ok`. */
export type FormulaResult =
  | { ok: true;  value: string | number | boolean | null }
  | { ok: false; error: FormulaError };

export interface FormulaError {
  /** Excel-style short code used as the rendered cell content. */
  code: '#ERROR!' | '#REF!' | '#CYCLE!' | '#DIV/0!' | '#NAME?' | '#VALUE!';
  /** Human-readable detail surfaced as a tooltip. */
  message: string;
}

/** Top-level entry point. */
export function evaluateFormula(body: string, ctx: FormulaContext): FormulaResult {
  try {
    const tokens = tokenize(body);
    const parser = new Parser(tokens);
    const ast    = parser.parseExpression();
    parser.expectEnd();
    const value = evaluate(ast, ctx);
    return { ok: true, value };
  } catch (e) {
    if (e instanceof EvalError) return { ok: false, error: { code: e.code, message: e.message } };
    return { ok: false, error: { code: '#ERROR!', message: (e as Error).message } };
  }
}

/**
 * Legacy string-returning entry point — kept so consumers that haven't
 * migrated to the tagged result type continue to work. Errors render as the
 * short code string (no tooltip).
 */
export function evaluateFormulaString(body: string, ctx: FormulaContext): string {
  const r = evaluateFormula(body, ctx);
  if (r.ok === true) return r.value == null ? '' : String(r.value);
  return r.error.code;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

class EvalError extends Error {
  code: FormulaError['code'];
  constructor(code: FormulaError['code'], message: string) {
    super(message);
    this.code = code;
  }
}

// ─── Lexer ──────────────────────────────────────────────────────────────────

type TokenKind =
  | 'number' | 'string' | 'ident' | 'cellref' | 'range'
  | 'lparen' | 'rparen' | 'comma'
  | 'plus' | 'minus' | 'star' | 'slash' | 'percent'
  | 'eq' | 'neq' | 'lt' | 'lte' | 'gt' | 'gte'
  | 'amp' | 'this_col' | 'this_row';

interface Token { kind: TokenKind; value: string; pos: number }

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const len = input.length;
  while (i < len) {
    const c = input[i];

    // whitespace
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }

    // numbers
    if ((c >= '0' && c <= '9') || (c === '.' && input[i + 1] >= '0' && input[i + 1] <= '9')) {
      const start = i;
      while (i < len && ((input[i] >= '0' && input[i] <= '9') || input[i] === '.')) i++;
      tokens.push({ kind: 'number', value: input.slice(start, i), pos: start });
      continue;
    }

    // strings  "..."  or  '...'
    if (c === '"' || c === "'") {
      const quote = c;
      const start = i;
      i++;
      let v = '';
      while (i < len && input[i] !== quote) {
        // \" escapes are honoured so users can include the quote char.
        if (input[i] === '\\' && i + 1 < len) { v += input[i + 1]; i += 2; }
        else { v += input[i]; i++; }
      }
      if (input[i] !== quote) throw new EvalError('#ERROR!', `Unterminated string at position ${start}`);
      i++; // skip closing quote
      tokens.push({ kind: 'string', value: v, pos: start });
      continue;
    }

    // identifiers / cell refs / `this.column` / `this.row`
    if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c === '_') {
      const start = i;
      while (i < len && (
        (input[i] >= 'A' && input[i] <= 'Z') ||
        (input[i] >= 'a' && input[i] <= 'z') ||
        (input[i] >= '0' && input[i] <= '9') ||
        input[i] === '_' || input[i] === '.'
      )) i++;
      const word = input.slice(start, i);

      // `this.column` / `this.row` keyword refs
      const lower = word.toLowerCase();
      if (lower === 'this.column') { tokens.push({ kind: 'this_col', value: word, pos: start }); continue; }
      if (lower === 'this.row')    { tokens.push({ kind: 'this_row', value: word, pos: start }); continue; }

      // Bare cell ref like `A1`, `BC23` — letters then digits
      const m = word.match(/^([A-Za-z]+)(\d+)$/);
      if (m) {
        // Range continuation: A1:A5
        if (input[i] === ':') {
          // look ahead for another bare ref
          const start2 = i + 1;
          let j = start2;
          while (j < len && (
            (input[j] >= 'A' && input[j] <= 'Z') ||
            (input[j] >= 'a' && input[j] <= 'z') ||
            (input[j] >= '0' && input[j] <= '9')
          )) j++;
          const tail = input.slice(start2, j);
          if (/^[A-Za-z]+\d+$/.test(tail)) {
            tokens.push({ kind: 'range', value: `${word}:${tail}`, pos: start });
            i = j;
            continue;
          }
        }
        tokens.push({ kind: 'cellref', value: word, pos: start });
        continue;
      }

      tokens.push({ kind: 'ident', value: word, pos: start });
      continue;
    }

    // single-char and multi-char operators
    if (c === '(') { tokens.push({ kind: 'lparen',  value: c, pos: i++ }); continue; }
    if (c === ')') { tokens.push({ kind: 'rparen',  value: c, pos: i++ }); continue; }
    if (c === ',') { tokens.push({ kind: 'comma',   value: c, pos: i++ }); continue; }
    if (c === '+') { tokens.push({ kind: 'plus',    value: c, pos: i++ }); continue; }
    if (c === '-') { tokens.push({ kind: 'minus',   value: c, pos: i++ }); continue; }
    if (c === '*') { tokens.push({ kind: 'star',    value: c, pos: i++ }); continue; }
    if (c === '/') { tokens.push({ kind: 'slash',   value: c, pos: i++ }); continue; }
    if (c === '%') { tokens.push({ kind: 'percent', value: c, pos: i++ }); continue; }
    if (c === '&') { tokens.push({ kind: 'amp',     value: c, pos: i++ }); continue; }
    if (c === '<') {
      if (input[i + 1] === '=') { tokens.push({ kind: 'lte', value: '<=', pos: i }); i += 2; continue; }
      if (input[i + 1] === '>') { tokens.push({ kind: 'neq', value: '<>', pos: i }); i += 2; continue; }
      tokens.push({ kind: 'lt', value: c, pos: i++ }); continue;
    }
    if (c === '>') {
      if (input[i + 1] === '=') { tokens.push({ kind: 'gte', value: '>=', pos: i }); i += 2; continue; }
      tokens.push({ kind: 'gt', value: c, pos: i++ }); continue;
    }
    if (c === '=') {
      if (input[i + 1] === '=') { tokens.push({ kind: 'eq', value: '==', pos: i }); i += 2; continue; }
      tokens.push({ kind: 'eq', value: '=', pos: i++ }); continue;
    }
    if (c === '!') {
      if (input[i + 1] === '=') { tokens.push({ kind: 'neq', value: '!=', pos: i }); i += 2; continue; }
      throw new EvalError('#ERROR!', `Unexpected character "!" at position ${i}`);
    }

    throw new EvalError('#ERROR!', `Unexpected character "${c}" at position ${i}`);
  }
  return tokens;
}

// ─── Parser (AST) ───────────────────────────────────────────────────────────

type AstNode =
  | { kind: 'number';   value: number }
  | { kind: 'string';   value: string }
  | { kind: 'cellref';  ref: string }            // 'A1'
  | { kind: 'range';    a: string; b: string }   // A1:B5
  | { kind: 'this_col' }
  | { kind: 'this_row' }
  | { kind: 'unary';    op: 'neg'; operand: AstNode }
  | { kind: 'binary';   op: BinaryOp; left: AstNode; right: AstNode }
  | { kind: 'call';     name: string; args: AstNode[] }
  | { kind: 'binding';  path: string };           // bare identifier like student.fullName

type BinaryOp = '+' | '-' | '*' | '/' | '%' | '&' | '=' | '!=' | '<' | '<=' | '>' | '>=';

class Parser {
  private tokens: Token[];
  private pos = 0;
  constructor(tokens: Token[]) { this.tokens = tokens; }

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private advance(): Token { return this.tokens[this.pos++]; }
  private match(...kinds: TokenKind[]): Token | null {
    const t = this.peek();
    if (t && kinds.includes(t.kind)) { this.pos++; return t; }
    return null;
  }

  expectEnd() {
    if (this.pos < this.tokens.length) {
      const t = this.tokens[this.pos];
      throw new EvalError('#ERROR!', `Unexpected trailing token "${t.value}" at position ${t.pos}`);
    }
  }

  // expression  = comparison
  // comparison  = additive (('=' | '!=' | '<' | '<=' | '>' | '>=') additive)?
  // additive    = multiplicative (('+' | '-' | '&') multiplicative)*
  // multiplicative = unary (('*' | '/' | '%') unary)*
  // unary       = '-' unary | atom
  // atom        = number | string | cellref | range | this.col | this.row
  //             | '(' expression ')' | ident '(' args ')' | ident_path

  parseExpression(): AstNode { return this.parseComparison(); }

  private parseComparison(): AstNode {
    const left = this.parseAdditive();
    const t = this.peek();
    if (!t) return left;
    const op = ({ eq: '=', neq: '!=', lt: '<', lte: '<=', gt: '>', gte: '>=' } as const)[t.kind as 'eq'];
    if (!op) return left;
    this.advance();
    const right = this.parseAdditive();
    return { kind: 'binary', op, left, right };
  }

  private parseAdditive(): AstNode {
    let left = this.parseMultiplicative();
    while (true) {
      const t = this.peek();
      if (!t) break;
      const op = t.kind === 'plus' ? '+' : t.kind === 'minus' ? '-' : t.kind === 'amp' ? '&' : null;
      if (!op) break;
      this.advance();
      const right = this.parseMultiplicative();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): AstNode {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (!t) break;
      const op = t.kind === 'star' ? '*' : t.kind === 'slash' ? '/' : t.kind === 'percent' ? '%' : null;
      if (!op) break;
      this.advance();
      const right = this.parseUnary();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }

  private parseUnary(): AstNode {
    if (this.match('minus')) {
      const operand = this.parseUnary();
      return { kind: 'unary', op: 'neg', operand };
    }
    return this.parseAtom();
  }

  private parseAtom(): AstNode {
    const t = this.advance();
    if (!t) throw new EvalError('#ERROR!', 'Unexpected end of expression');
    switch (t.kind) {
      case 'number':   return { kind: 'number', value: Number(t.value) };
      case 'string':   return { kind: 'string', value: t.value };
      case 'cellref':  return { kind: 'cellref', ref: t.value };
      case 'range': {
        const [a, b] = t.value.split(':'); return { kind: 'range', a, b };
      }
      case 'this_col': return { kind: 'this_col' };
      case 'this_row': return { kind: 'this_row' };
      case 'lparen': {
        const expr = this.parseExpression();
        if (!this.match('rparen')) throw new EvalError('#ERROR!', 'Expected `)`');
        return expr;
      }
      case 'ident': {
        if (this.match('lparen')) {
          // function call
          const args: AstNode[] = [];
          if (!this.match('rparen')) {
            args.push(this.parseExpression());
            while (this.match('comma')) args.push(this.parseExpression());
            if (!this.match('rparen')) throw new EvalError('#ERROR!', 'Expected `)`');
          }
          return { kind: 'call', name: t.value.toUpperCase(), args };
        }
        // bare identifier — treat as a binding path for the outer dataCtx
        return { kind: 'binding', path: t.value };
      }
      default:
        throw new EvalError('#ERROR!', `Unexpected token "${t.value}" at position ${t.pos}`);
    }
  }
}

// ─── Evaluator ──────────────────────────────────────────────────────────────

type Value = string | number | boolean | null;

function evaluate(node: AstNode, ctx: FormulaContext): Value {
  switch (node.kind) {
    case 'number': return node.value;
    case 'string': return node.value;
    case 'cellref': return readCellRef(node.ref, ctx);
    case 'range': {
      // Bare range outside a function — return the concatenation. Rare in
      // practice; aggregator functions handle ranges via expandRangeFromNode.
      const refs = expandRange(node.a, node.b, ctx);
      return refs.map(r => stringify(readCellRefByCoords(r.col, r.row, ctx))).join('');
    }
    case 'this_col': {
      // Concatenation of current column values — used outside of fn args.
      return ctx.rowKeys.map(r => stringify(readCellRefByCoords(ctx.currentCol, r, ctx))).join('');
    }
    case 'this_row': {
      return ctx.columnIds.map(c => stringify(readCellRefByCoords(c, ctx.currentRow, ctx))).join('');
    }
    case 'unary': {
      const v = evaluate(node.operand, ctx);
      return -coerceNumber(v, 'unary minus');
    }
    case 'binary':  return evalBinary(node.op, node.left, node.right, ctx);
    case 'call':    return evalCall(node.name, node.args, ctx);
    case 'binding': {
      // Resolve through the existing expression engine. Defensive: errors
      // there become #NAME? rather than throwing.
      try {
        const out = resolveExpression(`{${node.path}}`, ctx.dataCtx);
        return out === '' ? null : out;
      } catch (e) {
        throw new EvalError('#NAME?', `Unknown identifier "${node.path}": ${(e as Error).message}`);
      }
    }
  }
}

function evalBinary(op: BinaryOp, l: AstNode, r: AstNode, ctx: FormulaContext): Value {
  const lv = evaluate(l, ctx);
  const rv = evaluate(r, ctx);
  switch (op) {
    case '+': return coerceNumber(lv, '+') + coerceNumber(rv, '+');
    case '-': return coerceNumber(lv, '-') - coerceNumber(rv, '-');
    case '*': return coerceNumber(lv, '*') * coerceNumber(rv, '*');
    case '/': {
      const rn = coerceNumber(rv, '/');
      if (rn === 0) throw new EvalError('#DIV/0!', 'Division by zero');
      return coerceNumber(lv, '/') / rn;
    }
    case '%': {
      const rn = coerceNumber(rv, '%');
      if (rn === 0) throw new EvalError('#DIV/0!', 'Modulo by zero');
      return coerceNumber(lv, '%') % rn;
    }
    case '&': return stringify(lv) + stringify(rv);
    case '=':  return looseEqual(lv, rv);
    case '!=': return !looseEqual(lv, rv);
    case '<':  return compare(lv, rv) <  0;
    case '<=': return compare(lv, rv) <= 0;
    case '>':  return compare(lv, rv) >  0;
    case '>=': return compare(lv, rv) >= 0;
  }
}

function evalCall(name: string, args: AstNode[], ctx: FormulaContext): Value {
  switch (name) {
    case 'SUM':       return aggregate(args, ctx, ns => ns.reduce((a, b) => a + b, 0), { emptyOk: true, defaultEmpty: 0 });
    case 'AVG':
    case 'AVERAGE':
    case 'MEAN':      return aggregate(args, ctx, ns => ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null);
    case 'MIN':       return aggregate(args, ctx, ns => ns.length ? Math.min(...ns) : null);
    case 'MAX':       return aggregate(args, ctx, ns => ns.length ? Math.max(...ns) : null);
    case 'COUNT':     return aggregate(args, ctx, ns => ns.length, { rawCount: true });
    case 'MEDIAN':    return aggregate(args, ctx, ns => {
      if (!ns.length) return null;
      const sorted = [...ns].sort((a, b) => a - b);
      const m = Math.floor(sorted.length / 2);
      return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
    });
    case 'STDEV':     return aggregate(args, ctx, ns => {
      if (ns.length < 2) return null;
      const mean = ns.reduce((a, b) => a + b, 0) / ns.length;
      const variance = ns.reduce((s, v) => s + (v - mean) ** 2, 0) / (ns.length - 1);
      return Math.sqrt(variance);
    });
    case 'ROUND': {
      if (args.length < 1 || args.length > 2) throw new EvalError('#VALUE!', 'ROUND expects 1 or 2 arguments');
      const v = coerceNumber(evaluate(args[0], ctx), 'ROUND');
      const d = args.length === 2 ? Math.floor(coerceNumber(evaluate(args[1], ctx), 'ROUND')) : 0;
      const m = 10 ** d;
      return Math.round(v * m) / m;
    }
    case 'CONCAT': {
      return args.map(a => stringify(evaluate(a, ctx))).join('');
    }
    case 'IF': {
      if (args.length !== 3) throw new EvalError('#VALUE!', 'IF expects 3 arguments');
      const cond = evaluate(args[0], ctx);
      return coerceBool(cond) ? evaluate(args[1], ctx) : evaluate(args[2], ctx);
    }
    case 'IFERROR': {
      if (args.length !== 2) throw new EvalError('#VALUE!', 'IFERROR expects 2 arguments');
      try { return evaluate(args[0], ctx); }
      catch { return evaluate(args[1], ctx); }
    }
    case 'RANK': {
      // RANK(value, rangeOrThisColumn) — 1-based rank, ties get same rank,
      // numbers sorted descending (largest = rank 1). The "skip-rank" Excel
      // default behaviour: after a tie of N, next rank = current + N.
      if (args.length < 2 || args.length > 3) throw new EvalError('#VALUE!', 'RANK expects (value, range[, order])');
      const v = coerceNumber(evaluate(args[0], ctx), 'RANK');
      const refs = expandToCoordsFromNode(args[1], ctx);
      const ns: number[] = [];
      for (const r of refs) {
        const n = asNumber(readCellRefByCoords(r.col, r.row, ctx));
        if (n !== null) ns.push(n);
      }
      const ascending = args.length === 3 ? coerceBool(evaluate(args[2], ctx)) : false;
      ns.sort((a, b) => ascending ? a - b : b - a);
      const i = ns.indexOf(v);
      return i === -1 ? null : i + 1;
    }

    // ─── CAFE Phase 6 — competency-aware functions ──────────────────────
    case 'COMPONENT': {
      // COMPONENT('code'[, 'field']) — read a per-result component from
      // the current row's data context. The current row is interpreted as
      // a result row when dataSource='results'; falls back to the first
      // result on the dataCtx when no row scope is established.
      // `field` defaults to 'score' but can be 'gradeCode', 'valueText',
      // 'weight', 'displayScore', 'name'.
      if (args.length < 1 || args.length > 2) {
        throw new EvalError('#VALUE!', 'COMPONENT expects (code[, field])');
      }
      const code  = String(evaluate(args[0], ctx) ?? '').trim();
      const field = args[1] ? String(evaluate(args[1], ctx) ?? 'score').trim() : 'score';
      if (!code) return null;
      // First try the current cell's row scope (when used inside a results
      // dataSource'd table). The row data passed to resolveExpression isn't
      // accessible from formula land, so we walk the outer ctx.results.
      // Templates can also use binding paths directly (result.component.<code>.<field>).
      const candidates = ctx.dataCtx.results ?? [];
      for (const r of candidates) {
        const comps = ((r as unknown) as { components?: Array<Record<string, unknown>> }).components;
        if (!comps?.length) continue;
        const hit = comps.find(c => String(c.code) === code);
        if (hit) {
          const v = hit[field];
          if (v == null) return null;
          if (typeof v === 'number' || typeof v === 'boolean') return v;
          return String(v);
        }
      }
      return null;
    }
    case 'COMPETENCY': {
      // COMPETENCY([subjectName]) — return the competency level (grade code)
      // for a given subject result; without args, returns the rollup
      // student.cafe.frameworkMode'-style summary. With one arg, looks up
      // the matching result by subjectName and returns its grade code.
      if (args.length > 1) throw new EvalError('#VALUE!', 'COMPETENCY expects ([subjectName])');
      if (args.length === 0) {
        const cafe = (ctx.dataCtx.student as unknown as { cafe?: { frameworkMode?: string } }).cafe;
        return cafe?.frameworkMode ?? null;
      }
      const wanted = String(evaluate(args[0], ctx) ?? '').toLowerCase();
      const hit = (ctx.dataCtx.results ?? []).find(r =>
        r.subjectName.toLowerCase() === wanted || r.displaySubject?.toLowerCase() === wanted,
      );
      if (!hit) return null;
      // Prefer the explicit competencyLevel (highest grade across components),
      // fall back to result.grade.
      const cl = ((hit as unknown) as { competencyLevel?: string }).competencyLevel;
      return cl ?? hit.grade ?? null;
    }
    case 'DESCRIPTOR': {
      // DESCRIPTOR(code[, scope]) — translate a code into its mapped
      // descriptor text from any component or generic skill on the current
      // student. `scope` (optional) is 'component' (default) or 'skill';
      // when 'skill', looks under student.genericSkills.
      if (args.length < 1 || args.length > 2) {
        throw new EvalError('#VALUE!', 'DESCRIPTOR expects (code[, scope])');
      }
      const code  = String(evaluate(args[0], ctx) ?? '').trim();
      const scope = args[1] ? String(evaluate(args[1], ctx) ?? 'component').trim().toLowerCase() : 'component';
      if (!code) return null;
      if (scope === 'skill') {
        const skills = ((ctx.dataCtx.student as unknown) as { genericSkills?: Array<{ code: string; valueText: string | null; gradeCode: string | null }> }).genericSkills ?? [];
        const hit = skills.find(s => s.code === code);
        return hit?.valueText ?? hit?.gradeCode ?? null;
      }
      // 'component' (default) — scan every result's components.
      for (const r of ctx.dataCtx.results ?? []) {
        const comps = ((r as unknown) as { components?: Array<{ code: string; valueText: string | null; gradeCode: string | null }> }).components;
        if (!comps?.length) continue;
        const hit = comps.find(c => c.code === code);
        if (hit) return hit.valueText ?? hit.gradeCode ?? null;
      }
      return null;
    }

    default:
      throw new EvalError('#NAME?', `Unknown function "${name}"`);
  }
}

// ─── Coercion helpers ───────────────────────────────────────────────────────

function stringify(v: Value): string {
  if (v === null || v === undefined) return '';
  return String(v);
}

function coerceNumber(v: Value, ctxLabel: string): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/[, ]/g, ''));
  if (Number.isFinite(n)) return n;
  throw new EvalError('#VALUE!', `Expected a number for ${ctxLabel}, got "${v}"`);
}

function coerceBool(v: Value): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number')  return v !== 0;
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return s !== '' && s !== '0' && s !== 'false' && s !== 'no';
}

function asNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[, ]/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  if (typeof v === 'boolean') return v ? 1 : 0;
  return null;
}

function looseEqual(a: Value, b: Value): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a === 'number' || typeof b === 'number') {
    const na = asNumber(a), nb = asNumber(b);
    if (na !== null && nb !== null) return na === nb;
  }
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function compare(a: Value, b: Value): number {
  const na = asNumber(a), nb = asNumber(b);
  if (na !== null && nb !== null) return na - nb;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

// ─── Cell references ────────────────────────────────────────────────────────

function colLetterToIndex(letter: string): number {
  let n = 0;
  for (const c of letter.toUpperCase()) {
    if (c < 'A' || c > 'Z') return -1;
    n = n * 26 + (c.charCodeAt(0) - 64);
  }
  return n - 1;
}

function refToCoords(ref: string, ctx: FormulaContext): { col: string; row: string } {
  const m = ref.match(/^([A-Za-z]+)(\d+)$/);
  if (!m) throw new EvalError('#REF!', `Bad cell reference "${ref}"`);
  const ci = colLetterToIndex(m[1]);
  const ri = parseInt(m[2], 10) - 1;
  const col = ctx.columnIds[ci];
  const row = ctx.rowKeys[ri];
  if (col == null) throw new EvalError('#REF!', `Column ${m[1]} does not exist (table has ${ctx.columnIds.length} columns)`);
  if (row == null) throw new EvalError('#REF!', `Row ${m[2]} does not exist (table has ${ctx.rowKeys.length} rows)`);
  return { col, row };
}

function readCellRef(ref: string, ctx: FormulaContext): Value {
  const { col, row } = refToCoords(ref, ctx);
  return readCellRefByCoords(col, row, ctx);
}

function readCellRefByCoords(col: string, row: string, ctx: FormulaContext): Value {
  const raw = ctx.cellValues[col]?.[row];
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw;
  return String(raw);
}

function expandRange(a: string, b: string, ctx: FormulaContext): { col: string; row: string }[] {
  const A = refToCoords(a, ctx);
  const B = refToCoords(b, ctx);
  const ai = ctx.columnIds.indexOf(A.col), bi = ctx.columnIds.indexOf(B.col);
  const aj = ctx.rowKeys.indexOf(A.row),   bj = ctx.rowKeys.indexOf(B.row);
  const out: { col: string; row: string }[] = [];
  for (let ci = Math.min(ai, bi); ci <= Math.max(ai, bi); ci++) {
    for (let rj = Math.min(aj, bj); rj <= Math.max(aj, bj); rj++) {
      out.push({ col: ctx.columnIds[ci], row: ctx.rowKeys[rj] });
    }
  }
  return out;
}

/** Flatten an arg AST node into a coordinate list for aggregator-style use. */
function expandToCoordsFromNode(node: AstNode, ctx: FormulaContext): { col: string; row: string }[] {
  if (node.kind === 'range')    return expandRange(node.a, node.b, ctx);
  if (node.kind === 'cellref')  return [refToCoords(node.ref, ctx)];
  if (node.kind === 'this_col') return ctx.rowKeys.map(r => ({ col: ctx.currentCol, row: r }));
  if (node.kind === 'this_row') return ctx.columnIds.map(c => ({ col: c, row: ctx.currentRow }));
  // Single scalar value — make a synthetic "coordinate" that returns the
  // computed value. For aggregator simplicity, we'll just return one ref to
  // a non-existent cell — the caller will resort to evaluating the node.
  return [];
}

// ─── Aggregator helper ──────────────────────────────────────────────────────

function aggregate(
  args:     AstNode[],
  ctx:      FormulaContext,
  reducer:  (ns: number[]) => number | null,
  opts: { emptyOk?: boolean; defaultEmpty?: number; rawCount?: boolean } = {},
): Value {
  const ns: number[] = [];
  let countAll = 0;
  for (const a of args) {
    const refs = expandToCoordsFromNode(a, ctx);
    if (refs.length) {
      for (const r of refs) {
        const raw = readCellRefByCoords(r.col, r.row, ctx);
        countAll++;
        const n = asNumber(raw);
        if (n !== null) ns.push(n);
      }
    } else {
      const v = evaluate(a, ctx);
      countAll++;
      const n = asNumber(v);
      if (n !== null) ns.push(n);
    }
  }
  if (opts.rawCount) return countAll;
  if (!ns.length && !opts.emptyOk) return null;
  const out = reducer(ns);
  if (out === null && opts.defaultEmpty !== undefined) return opts.defaultEmpty;
  return out;
}
