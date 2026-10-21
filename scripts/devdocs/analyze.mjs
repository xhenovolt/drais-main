/**
 * Developer-documentation analyser — reads the REAL source tree and records
 * what each file actually does. Nothing here is written by hand about a file:
 * every fact is taken from the syntax tree (TypeScript compiler API, parse only,
 * no type-check), so it is only as good as the code is explicit.
 *
 * Where the code cannot be read with confidence (a request URL built from a
 * variable, a component passed through props) the fact is recorded as
 * `unresolved`, and the documentation page shows it as "needs manual review"
 * rather than guessing.
 *
 * Used by scripts/devdocs/generate.mjs (writes the index the Control Center
 * docs read) and by the staleness test in src/lib/devdocs/__tests__.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';

const SRC_DIRS = ['src/app', 'src/components', 'src/hooks', 'src/lib', 'src/contexts', 'src/services', 'src/utils', 'src/types', 'src/middleware', 'src/actions', 'src/store'];
const EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const REACT_HOOKS = new Set(['useState', 'useEffect', 'useLayoutEffect', 'useMemo', 'useCallback', 'useRef', 'useReducer', 'useContext', 'useTransition', 'useDeferredValue', 'useId', 'useSyncExternalStore', 'useImperativeHandle', 'useInsertionEffect', 'useOptimistic', 'useActionState', 'use']);
const FETCHERS = new Set(['fetch', 'apiFetch', 'useSWR', 'useSWRImmutable', 'useSWRInfinite', 'mutate', 'fetcher', 'swrFetcher', 'postJson', 'getJson']);
const PERMISSION_CALLS = new Set(['requirePermission', 'checkPermission', 'hasPermission', 'can', 'requireControl', 'requireModule', 'usePermission', 'hasAnyPermission']);
const SPECIAL_APP_FILES = ['page', 'layout', 'loading', 'error', 'not-found', 'template', 'default', 'route', 'global-error'];
const SQL_KEYWORDS = new Set(['select', 'where', 'set', 'values', 'dual', 'information_schema', 'the', 'a', 'and', 'or', 'on', 'as', 'if', 'not', 'exists', 'lateral', 'json_table', 'unnest', 'sqlite_master', 'pragma_table_info']);

const posix = (p) => p.split(path.sep).join('/');

export function listSourceFiles(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const rel = dir + '/' + e.name;
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        walk(rel);
      } else if (EXT.includes(path.extname(e.name)) && !e.name.endsWith('.d.ts')) {
        out.push(rel);
      }
    }
  };
  for (const d of SRC_DIRS) walk(d);
  for (const f of ['src/middleware.ts', 'src/instrumentation.ts', 'src/instrumentation-node.ts']) if (fs.existsSync(path.join(root, f))) out.push(f);
  return out.sort();
}

const isTestFile = (f) => /__tests__\/|\.test\.|\.spec\./.test(f);

// ─── Route arithmetic ─────────────────────────────────────────────────────────

/** src/app/(protected)/students/[id]/page.tsx → { url: '/students/[id]', special: 'page' } */
export function appRouteOf(file) {
  if (!file.startsWith('src/app/')) return null;
  const parts = file.slice('src/app/'.length).split('/');
  const base = parts.pop();
  const stem = base.replace(/\.(tsx?|jsx?|mjs)$/, '');
  if (!SPECIAL_APP_FILES.includes(stem)) return null;
  if (parts.some((p) => p.startsWith('_'))) return null; // private folders are not routes
  const segs = parts.filter((p) => !(p.startsWith('(') && p.endsWith(')')) && !p.startsWith('@'));
  return { url: '/' + segs.join('/'), special: stem, dir: ['src/app', ...parts].join('/') };
}

/** Turn '/api/students/[id]/photo' into a matcher for request URLs. */
function routePattern(url) {
  const re = url.split('/').map((s) => {
    if (/^\[\[\.\.\..+\]\]$/.test(s)) return '(?:/.*)?';
    if (/^\[\.\.\..+\]$/.test(s)) return '/.+';
    if (/^\[.+\]$/.test(s)) return '/[^/]+';
    return s ? '/' + s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
  }).join('');
  return new RegExp('^' + (re || '/') + '/?$');
}

// ─── Import resolution ────────────────────────────────────────────────────────

function resolveImport(root, fromFile, spec, exists) {
  let base = null;
  if (spec.startsWith('@/')) base = 'src/' + spec.slice(2);
  else if (spec.startsWith('./') || spec.startsWith('../')) base = posix(path.normalize(path.join(path.dirname(fromFile), spec)));
  else return null;
  const candidates = [base, ...EXT.map((e) => base + e), ...EXT.map((e) => base + '/index' + e)];
  for (const c of candidates) if (exists.has(c)) return c;
  // An explicit .js specifier pointing at a .ts source (ESM style)
  const noExt = base.replace(/\.(m?js)$/, '');
  for (const e of EXT) if (exists.has(noExt + e)) return noExt + e;
  // Non-code assets (json, css) and code outside the scanned folders: ask the disk, with exact case —
  // Windows and macOS resolve `ui/card` to `ui/Card.tsx`, the Linux build server does not.
  for (const c of candidates) {
    const hit = exactCaseExists(root, c);
    if (hit === true) return c;
    if (hit === 'case') return { caseMismatch: c };
  }
  return undefined; // relative/alias import that does not resolve → broken
}

const dirCache = new Map();
/** true = exists with this exact case; 'case' = exists only case-insensitively; false = absent. */
function exactCaseExists(root, rel) {
  const parts = rel.split('/');
  let dir = '';
  for (let i = 0; i < parts.length; i++) {
    const key = dir;
    if (!dirCache.has(key)) { try { dirCache.set(key, fs.readdirSync(path.join(root, dir))); } catch { dirCache.set(key, []); } }
    const names = dirCache.get(key);
    if (names.includes(parts[i])) { dir = dir ? dir + '/' + parts[i] : parts[i]; continue; }
    const ci = names.find((n) => n.toLowerCase() === parts[i].toLowerCase());
    if (!ci) return false;
    if (i === parts.length - 1 || fs.statSync(path.join(root, dir, ci)).isDirectory()) {
      const rest = [ci, ...parts.slice(i + 1)].join('/');
      return fs.existsSync(path.join(root, dir, rest)) ? 'case' : false;
    }
    return false;
  }
  try { return fs.statSync(path.join(root, rel)).isFile(); } catch { return false; }
}

function importCategory(spec, resolved) {
  if (resolved) {
    if (resolved.startsWith('src/components/')) return 'component';
    if (resolved.startsWith('src/hooks/') || /\/use[A-Z][^/]*$/.test(resolved.replace(/\.\w+$/, ''))) return 'hook';
    if (resolved.startsWith('src/app/')) return 'route-local';
    if (resolved.startsWith('src/contexts/')) return 'context';
    return 'lib';
  }
  if (spec === 'react' || spec.startsWith('react/') || spec === 'react-dom') return 'react';
  if (spec.startsWith('next')) return 'next';
  if (spec.startsWith('node:') || ['fs', 'path', 'crypto', 'os', 'child_process', 'stream', 'zlib', 'url', 'util'].includes(spec)) return 'node';
  return 'package';
}

// ─── Per-file analysis ────────────────────────────────────────────────────────

function lineOf(sf, pos) { return sf.getLineAndCharacterOfPosition(pos).line + 1; }

function leadingDoc(sf, node) {
  const text = sf.getFullText();
  const ranges = ts.getLeadingCommentRanges(text, node.getFullStart()) || [];
  const docs = ranges.map((r) => text.slice(r.pos, r.end)).filter((c) => c.startsWith('/**'));
  if (!docs.length) return null;
  return cleanComment(docs[docs.length - 1]);
}

function cleanComment(c) {
  return c.replace(/^\/\*\*?/, '').replace(/\*\/$/, '').split('\n').map((l) => l.replace(/^\s*\* ?/, '')).join('\n').trim();
}

function fileHeaderComment(sf) {
  const text = sf.getFullText();
  // 'use client' comes first in client files; their header usually sits just below it.
  const isDirective = (st) => st && ts.isExpressionStatement(st) && ts.isStringLiteral(st.expression);
  const at = (st) => ts.getLeadingCommentRanges(text, st ? st.getFullStart() : 0) || [];
  let ranges = at(sf.statements[0]);
  if (!ranges.length && isDirective(sf.statements[0])) ranges = at(sf.statements[1]);
  // The header is the first block comment, or a run of // lines, before any code.
  const block = ranges.find((r) => text.slice(r.pos, r.pos + 2) === '/*');
  if (block) return cleanComment(text.slice(block.pos, block.end)).slice(0, 4000) || null;
  const lines = ranges.filter((r) => text.slice(r.pos, r.pos + 2) === '//').map((r) => text.slice(r.pos + 2, r.end).replace(/^ /, ''));
  return lines.length >= 2 ? lines.join('\n').slice(0, 4000) : null;
}

/**
 * Every URL a request argument can take. Follows, in this file only: string and
 * template literals, `a ? x : y`, `base + x`, and a variable whose declaration is
 * visible from the call (nearest enclosing block first). A name imported from
 * another module is returned as `importRef` and resolved once the whole tree is read.
 */
function urlArgs(node, importedNames, depth = 0) {
  if (!node) return [{ unresolved: 'no argument' }];
  if (depth > 4) return [{ unresolved: node.getText().slice(0, 80) }];
  if (ts.isParenthesizedExpression(node) || ts.isAsExpression(node)) return urlArgs(node.expression, importedNames, depth + 1);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [{ url: node.text }];
  if (ts.isTemplateExpression(node)) {
    let s = node.head.text;
    for (const span of node.templateSpans) {
      // `${API_BASE}/x` — inline a constant prefix when it is a plain string in this file
      const inner = ts.isIdentifier(span.expression) && s === '' ? urlArgs(span.expression, importedNames, depth + 1)[0] : null;
      s += inner?.url && !inner.templated ? inner.url : ':param';
      s += span.literal.text;
    }
    return [{ url: s, templated: s.includes(':param') }];
  }
  if (ts.isConditionalExpression(node)) {
    const both = [...urlArgs(node.whenTrue, importedNames, depth + 1), ...urlArgs(node.whenFalse, importedNames, depth + 1)];
    const urls = both.filter((x) => x.url || x.importRef);
    return urls.length ? urls : both.slice(0, 1);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const l = urlArgs(node.left, importedNames, depth + 1).filter((x) => x.url);
    const r = urlArgs(node.right, importedNames, depth + 1)[0];
    const tail = r?.url && !r.templated ? r.url : ':param';
    if (l.length) return l.map((x) => ({ url: x.url + tail, templated: !!x.templated || tail === ':param' }));
  }
  if (ts.isIdentifier(node)) {
    const decl = visibleDeclaration(node);
    if (decl?.initializer) return urlArgs(decl.initializer, importedNames, depth + 1);
    const imp = importedNames.get(node.text);
    if (imp?.resolved) return [{ importRef: { name: node.text, from: imp.resolved } }];
  }
  return [{ unresolved: node.getText().slice(0, 80) }];
}

/** The `const/let name = …` nearest above `id` in an enclosing block or the file. */
function visibleDeclaration(id) {
  const name = id.text;
  const at = id.getStart();
  for (let p = id.parent; p; p = p.parent) {
    const stmts = ts.isBlock(p) || ts.isSourceFile(p) || ts.isModuleBlock(p) ? p.statements : null;
    if (!stmts) continue;
    let found = null;
    for (const st of stmts) {
      if (st.getStart() > at) break;
      if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name) && d.name.text === name) found = d;
    }
    if (found) return found;
  }
  return null;
}

function pushRequest(info, req, a) {
  if (a.url) {
    const n = normaliseRequestUrl(a.url);
    if (n) { req.url = n; if (a.templated) req.templated = true; } else req.external = a.url.slice(0, 120);
  } else if (a.importRef) req.importRef = a.importRef;
  else req.unresolved = a.unresolved;
  if (req.url || req.unresolved || req.importRef || req.external) info.requests.push(req);
}

function normaliseRequestUrl(u) {
  let s = u.split('?')[0].split('#')[0];
  s = s.replace(/:param(?=[^/]*:param)/g, ''); // collapse neighbouring params in one segment
  // `/api/payments${qs}` — a value glued onto the end of a segment is a query string or suffix, not a path segment
  s = s.replace(/([^/]):param$/, '$1');
  if (!s.startsWith('/')) return null;
  return s.replace(/\/+$/, '') || '/';
}

/** Candidate table names in a SQL string; filtered later against the tables the repo actually creates. */
function sqlTables(text) {
  const out = new Set();
  const re = /\b(?:from|join|into|update|table(?:\s+if\s+(?:not\s+)?exists)?)\s+`?([a-z_][a-z0-9_]*)`?/gi;
  let m;
  while ((m = re.exec(text))) {
    const t = m[1].toLowerCase();
    if (!SQL_KEYWORDS.has(t)) out.add(t);
  }
  return out;
}

/** Every table name the repository creates: SQL migrations plus CREATE TABLE strings in code. */
function knownTables(root, files) {
  const names = new Set();
  const re = /create\s+table\s+(?:if\s+not\s+exists\s+)?`?([a-z_][a-z0-9_]*)`?/gi;
  const walk = (dir) => {
    let entries; try { entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!['exports', 'backup'].includes(e.name.toLowerCase())) walk(dir + '/' + e.name); }
      else if (e.name.endsWith('.sql')) for (const m of fs.readFileSync(path.join(root, dir, e.name), 'utf8').matchAll(re)) names.add(m[1].toLowerCase());
    }
  };
  for (const d of ['database', 'migrations', 'sql']) walk(d);
  for (const f of files) for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(re)) names.add(m[1].toLowerCase());
  return names;
}

// ─── Inside a component or hook: the units a reader has to understand ─────────

/** The body block of a top-level function declaration / `const X = () => {…}` / forwardRef(…) / memo(…). */
function functionBody(st) {
  let fn = null;
  if (ts.isFunctionDeclaration(st)) fn = st;
  else if (ts.isVariableStatement(st)) {
    let init = st.declarationList.declarations[0]?.initializer;
    while (init && ts.isCallExpression(init) && init.arguments[0]) init = init.arguments[0]; // forwardRef(fn), memo(fn)
    if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) fn = init;
  } else if (ts.isExportAssignment(st) && (ts.isArrowFunction(st.expression) || ts.isFunctionExpression(st.expression))) fn = st.expression;
  return fn && fn.body && ts.isBlock(fn.body) ? fn.body : null;
}

const HOOK_KIND = { useState: 'state', useReducer: 'state', useRef: 'ref', useMemo: 'memo', useCallback: 'callback', useEffect: 'effect', useLayoutEffect: 'effect' };

/**
 * Every statement at the top of a component/hook body, named so documentation can
 * key notes to it: handlers, state, refs, memos, callbacks, effects (with their
 * dependency arrays), other hook results, derived values, early returns, the render.
 * Effects/guards/renders have no name of their own, so they are numbered in order
 * (effect#1, effect#2 …) — stable under edits elsewhere in the file, unlike line numbers.
 */
function functionMembers(sf, st, isComponent) {
  const body = functionBody(st);
  if (!body) return undefined;
  const out = [];
  const counters = {};
  const nth = (k) => (counters[k] = (counters[k] || 0) + 1);
  const span = (n) => ({ start: lineOf(sf, n.getStart()), end: lineOf(sf, n.getEnd()) });
  const callName = (e) => (e && ts.isCallExpression(e) ? e.expression.getText().replace(/^React\./, '') : null);
  const depsOf = (call) => {
    const d = call.arguments[call.arguments.length - 1];
    return call.arguments.length >= 2 && d && ts.isArrayLiteralExpression(d) ? d.getText() : call.arguments.length >= 2 ? d.getText().slice(0, 80) : 'none (runs after every render)';
  };
  // API handlers wrap their whole body in try/catch/finally: read through the try so its
  // statements are documented one by one, and name the catch/finally blocks.
  const flat = [];
  for (const s of body.statements) {
    if (ts.isTryStatement(s)) {
      flat.push(...s.tryBlock.statements);
      if (s.catchClause) out.push({ name: `catch#${nth('catch')}`, kind: 'catch', ...span(s.catchClause) });
      if (s.finallyBlock) out.push({ name: `finally#${nth('finally')}`, kind: 'finally', ...span(s.finallyBlock) });
    } else flat.push(s);
  }
  for (const s of flat) {
    if (ts.isVariableStatement(s)) {
      for (const d of s.declarationList.declarations) {
        const init = d.initializer;
        const name = d.name.getText().replace(/\s+/g, ' ');
        const hook = callName(init);
        let kind = 'const';
        let deps;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) kind = 'function';
        else if (hook && HOOK_KIND[hook]) { kind = HOOK_KIND[hook]; if (kind === 'memo' || kind === 'callback') deps = depsOf(init); }
        else if (hook && /^use[A-Z]/.test(hook)) kind = 'hook';
        out.push({ name, kind, hook: hook && /^use/.test(hook) ? hook : undefined, deps, ...span(s) });
      }
    } else if (ts.isFunctionDeclaration(s) && s.name) {
      out.push({ name: s.name.text, kind: 'function', ...span(s) });
    } else if (ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && HOOK_KIND[callName(s.expression)] === 'effect') {
      out.push({ name: `effect#${nth('effect')}`, kind: 'effect', hook: callName(s.expression), deps: depsOf(s.expression), ...span(s) });
    } else if (ts.isExpressionStatement(s) && ts.isCallExpression(s.expression) && /^use[A-Z]/.test(callName(s.expression) || '')) {
      out.push({ name: `${callName(s.expression)}#${nth(callName(s.expression))}`, kind: 'hook', hook: callName(s.expression), ...span(s) });
    } else if (ts.isIfStatement(s)) {
      out.push({ name: `guard#${nth('guard')}`, kind: 'guard', condition: s.expression.getText().slice(0, 120), ...span(s) });
    } else if (ts.isReturnStatement(s)) {
      out.push({ name: isComponent ? `render#${nth('render')}` : `return#${nth('return')}`, kind: isComponent ? 'render' : 'return', ...span(s) });
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

export function analyseFile(root, file, exists) {
  const abs = path.join(root, file);
  const text = fs.readFileSync(abs, 'utf8');
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : file.endsWith('.ts') ? ts.ScriptKind.TS : ts.ScriptKind.JS;
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.js') || file.endsWith('.mjs') ? ts.ScriptKind.JSX : kind);
  const lines = text.split('\n').length;

  const info = {
    file, lines,
    sha: createHash('sha1').update(text).digest('hex').slice(0, 12),
    directive: null,
    header: fileHeaderComment(sf),
    imports: [],
    exports: [],
    declarations: [],
    hooks: [],          // { name, line, source, decl }
    state: [],          // { name, setter, line, decl }
    requests: [],       // { method, url?, unresolved?, line, via }
    rendered: [],       // { name, source, count }
    permissions: [],    // { call, code, line }
    authCalls: [],      // { call, from, line } — auth delegated to a helper (requireLessonAccess, getControlSession …)
    sessionScoped: false,
    sqlTables: [],
    i18nKeys: 0,
    usesI18n: false,
    classNames: 0,
    cssImports: [],
    forms: 0,
    httpMethods: [],
    routeConfig: {},
    dynamicImports: [],
  };

  // Directive
  const firstStmt = sf.statements[0];
  if (firstStmt && ts.isExpressionStatement(firstStmt) && ts.isStringLiteral(firstStmt.expression) && /^use (client|server)$/.test(firstStmt.expression.text)) {
    info.directive = firstStmt.expression.text;
  }

  const importedNames = new Map(); // local name → { spec, resolved, category }
  for (const st of sf.statements) {
    if (ts.isImportDeclaration(st) && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      const raw = resolveImport(root, file, spec, exists);
      const caseMismatch = raw && typeof raw === 'object' ? raw.caseMismatch : null;
      const resolved = caseMismatch ? undefined : raw;
      const names = [];
      const cl = st.importClause;
      if (cl) {
        if (cl.name) names.push({ local: cl.name.text, imported: 'default' });
        if (cl.namedBindings) {
          if (ts.isNamespaceImport(cl.namedBindings)) names.push({ local: cl.namedBindings.name.text, imported: '*' });
          else for (const el of cl.namedBindings.elements) names.push({ local: el.name.text, imported: (el.propertyName || el.name).text });
        }
      }
      const category = /\.(css|scss)$/.test(spec) ? 'style' : importCategory(spec, resolved);
      if (category === 'style') info.cssImports.push(spec);
      const entry = { spec, resolved: resolved || null, broken: resolved === undefined, caseMismatch, category, names: names.map((n) => n.imported === n.local ? n.local : `${n.imported} as ${n.local}`), typeOnly: !!cl?.isTypeOnly, line: lineOf(sf, st.getStart()) };
      info.imports.push(entry);
      for (const n of names) importedNames.set(n.local, { spec, resolved: resolved || null, category });
    }
    if (ts.isExportDeclaration(st) && st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier)) {
      const spec = st.moduleSpecifier.text;
      const raw2 = resolveImport(root, file, spec, exists); const resolved = typeof raw2 === 'string' ? raw2 : undefined;
      info.imports.push({ spec, resolved: resolved || null, broken: resolved === undefined, category: importCategory(spec, resolved), names: ['(re-export)'], typeOnly: false, line: lineOf(sf, st.getStart()) });
    }
  }

  // Top-level declarations = the file's code blocks
  const hasExport = (n) => !!ts.getModifiers?.(n)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
  const hasDefault = (n) => !!ts.getModifiers?.(n)?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword);
  for (const st of sf.statements) {
    let name = null; let dkind = null; let node = st;
    if (ts.isFunctionDeclaration(st)) { name = st.name?.text || 'default'; dkind = 'function'; }
    else if (ts.isClassDeclaration(st)) { name = st.name?.text || 'default'; dkind = 'class'; }
    else if (ts.isInterfaceDeclaration(st)) { name = st.name.text; dkind = 'interface'; }
    else if (ts.isTypeAliasDeclaration(st)) { name = st.name.text; dkind = 'type'; }
    else if (ts.isEnumDeclaration(st)) { name = st.name.text; dkind = 'enum'; }
    else if (ts.isVariableStatement(st)) {
      const d = st.declarationList.declarations[0];
      if (d && ts.isIdentifier(d.name)) {
        name = d.name.text;
        const init = d.initializer;
        dkind = init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) ? 'function'
          : init && ts.isCallExpression(init) && /forwardRef|memo|dynamic/.test(init.expression.getText()) ? 'function' : 'const';
      }
    } else if (ts.isExportAssignment(st)) { name = 'default'; dkind = 'export-default'; }
    if (!name) continue;
    const exported = hasExport(st) || ts.isExportAssignment(st);
    const isDefault = hasDefault(st) || ts.isExportAssignment(st);
    if (exported) info.exports.push(isDefault ? `default (${name})` : name);
    if (exported && dkind === 'function' && HTTP_METHODS.includes(name)) info.httpMethods.push(name);
    if (exported && dkind === 'const' && ['dynamic', 'revalidate', 'runtime', 'maxDuration', 'fetchCache', 'preferredRegion'].includes(name)) {
      const init = st.declarationList.declarations[0].initializer;
      info.routeConfig[name] = init ? init.getText().slice(0, 40) : '';
    }
    const isComponent = /^[A-Z]/.test(name) && (dkind === 'function' || (isDefault && dkind !== 'type')) && /\.(tsx|jsx)$/.test(file);
    const isHook = /^use[A-Z]/.test(name) && dkind === 'function';
    const declKind = isHook ? 'hook' : isComponent ? 'component' : dkind;
    info.declarations.push({
      name, kind: declKind,
      exported, isDefault,
      start: lineOf(sf, st.getStart()), end: lineOf(sf, st.getEnd()),
      doc: leadingDoc(sf, node),
      members: declKind === 'component' || declKind === 'hook' || dkind === 'function' ? functionMembers(sf, st, declKind === 'component') : undefined,
    });
  }
  // Named exports listed separately: export { a, b }
  for (const st of sf.statements) {
    if (ts.isExportDeclaration(st) && !st.moduleSpecifier && st.exportClause && ts.isNamedExports(st.exportClause)) {
      for (const el of st.exportClause.elements) info.exports.push(el.name.text);
    }
  }

  // Exported string constants (API_* base URLs) so requests in other files can be resolved through them.
  info.constUrls = {};
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st) || !hasExport(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (!ts.isIdentifier(d.name) || !d.initializer) continue;
      const v = urlArgs(d.initializer, importedNames)[0];
      if (v?.url?.startsWith('/')) info.constUrls[d.name.text] = v.url;
    }
  }

  const declAt = (line) => info.declarations.find((d) => line >= d.start && line <= d.end)?.name || null;
  const rendered = new Map();
  let i18nKeys = 0;

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const cname = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : null;
      const line = lineOf(sf, node.getStart());
      if (cname && /^use[A-Z]|^use$/.test(cname) && ts.isIdentifier(callee)) {
        const imp = importedNames.get(cname);
        const source = REACT_HOOKS.has(cname) && (!imp || imp.spec === 'react') ? 'react'
          : imp ? (imp.resolved || imp.spec) : info.declarations.some((d) => d.name === cname) ? 'this file' : 'unknown';
        info.hooks.push({ name: cname, line, source, decl: declAt(line) });
        if ((cname === 'useState' || cname === 'useReducer') && ts.isVariableDeclaration(node.parent) && ts.isArrayBindingPattern(node.parent.name)) {
          const els = node.parent.name.elements.map((e) => (ts.isBindingElement(e) && ts.isIdentifier(e.name) ? e.name.text : null));
          info.state.push({ name: els[0], setter: els[1] || null, line, decl: declAt(line), hook: cname, initial: node.arguments[0] ? node.arguments[0].getText().slice(0, 60) : '' });
        }
      }
      if (cname === 't' && ts.isIdentifier(callee) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) i18nKeys++;
      if (cname && FETCHERS.has(cname) && (ts.isIdentifier(callee) || (ts.isPropertyAccessExpression(callee) && /^(window|globalThis|axios)$/.test(callee.expression.getText())))) {
        const variants = urlArgs(node.arguments[0], importedNames);
        let method = cname.startsWith('useSWR') ? 'GET' : null;
        const opts = node.arguments[1];
        if (opts && ts.isObjectLiteralExpression(opts)) {
          for (const p of opts.properties) {
            if (ts.isPropertyAssignment(p) && p.name.getText() === 'method') method = ts.isStringLiteral(p.initializer) ? p.initializer.text.toUpperCase() : 'dynamic';
            if (ts.isShorthandPropertyAssignment(p) && p.name.getText() === 'method') method = 'dynamic';
          }
        }
        for (const a of variants) {
          if (cname === 'mutate' && !a.url) continue;
          const req = { via: cname, line, decl: declAt(line), method: method || (cname === 'fetch' || cname === 'apiFetch' ? 'GET' : null) };
          if (variants.length > 1) req.alternative = true;
          pushRequest(info, req, a);
        }
      }
      if (cname && ts.isPropertyAccessExpression(callee) && /^axios$/.test(callee.expression.getText()) && HTTP_METHODS.includes(cname.toUpperCase())) {
        for (const a of urlArgs(node.arguments[0], importedNames)) pushRequest(info, { via: 'axios', line, decl: declAt(line), method: cname.toUpperCase() }, a);
      }
      if (cname && PERMISSION_CALLS.has(cname)) {
        const args = node.arguments.map((a) => (ts.isStringLiteral(a) ? a.text : ts.isArrayLiteralExpression(a) ? a.elements.filter(ts.isStringLiteral).map((e) => e.text).join(' | ') : null)).filter(Boolean);
        if (args.length || cname !== 'can') info.permissions.push({ call: cname, code: args.join(', ') || '(dynamic)', line });
      }
      if (cname === 'getSessionSchoolId' || cname === 'getSession' || cname === 'getSessionInfo') info.sessionScoped = true;
      if (cname && ts.isIdentifier(callee) && !PERMISSION_CALLS.has(cname) && /^(require[A-Z]\w*|with\w*Auth\w*|get\w*Session\w*|verify\w*(Token|Session|Secret|Signature|Request|Key)\w*|authenticate\w*|\w+Access|\w+Session)$/.test(cname)) { const imp = importedNames.get(cname); info.authCalls.push({ call: cname, from: imp ? (imp.resolved || imp.spec) : 'this file', line: lineOf(sf, node.getStart()) }); }
      if (callee.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
        const spec = node.arguments[0].text;
        info.dynamicImports.push({ spec, resolved: (s => typeof s === 'string' ? s : null)(resolveImport(root, file, spec, exists)), line });
      }
    }
    if (ts.isNewExpression(node) && /^(EventSource|WebSocket)$/.test(node.expression.getText())) {
      const line = lineOf(sf, node.getStart());
      for (const a of urlArgs(node.arguments?.[0], importedNames)) pushRequest(info, { via: node.expression.getText(), line, decl: declAt(line), method: 'GET', stream: true }, a);
    }
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const line = lineOf(sf, node.getStart());
      const tag = node.tagName.getText();
      if (tag === 'form') info.forms++;
      const head = tag.split('.')[0];
      if (/^[A-Z]/.test(head)) {
        const imp = importedNames.get(head);
        const source = imp ? (imp.resolved || imp.spec) : info.declarations.some((d) => d.name === head) ? 'this file' : 'unknown';
        const r = rendered.get(tag) || { name: tag, source, count: 0, line };
        r.count++;
        rendered.set(tag, r);
      }
      for (const attr of node.attributes.properties) if (ts.isJsxAttribute(attr) && attr.name.getText() === 'className') info.classNames++;
    }
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) && /\b(select|insert|update|delete|create)\b/i.test(node.getText())) {
      for (const t of sqlTables(node.getText())) if (!info.sqlTables.includes(t)) info.sqlTables.push(t);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  info.rendered = [...rendered.values()].sort((a, b) => a.line - b.line);
  info.i18nKeys = i18nKeys;
  info.usesI18n = info.hooks.some((h) => /^use(I18n|Translation|T)$/.test(h.name)) || i18nKeys > 0;
  info.sqlTables.sort();
  return info;
}

// ─── Whole-tree index ─────────────────────────────────────────────────────────

function readPublicRoutes(root) {
  try {
    const mw = fs.readFileSync(path.join(root, 'src/middleware.ts'), 'utf8');
    const m = mw.match(/const PUBLIC_ROUTES\s*=\s*\[([\s\S]*?)\];/);
    return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  } catch { return []; }
}

function readNavigation(root) {
  try {
    const nav = fs.readFileSync(path.join(root, 'src/lib/navigationConfig.tsx'), 'utf8');
    const out = {};
    for (const m of nav.matchAll(/label:\s*(?:t\('[^']*',\s*)?'([^']+)'\)?[^\n]*?href:\s*'([^']+)'/g)) out[m[2]] ??= m[1];
    return out;
  } catch { return {}; }
}

/**
 * Modules = the sidebar's top-level groups (getNavigationItems in src/lib/navigationConfig.tsx),
 * in sidebar order, with the hrefs of their items. A top-level group sits at 6-space indent:
 *   { key: 'students', label: t('nav.students._', 'Students'), children: [ … href … ] }
 */
export function readModules(root) {
  let nav;
  try { nav = fs.readFileSync(path.join(root, 'src/lib/navigationConfig.tsx'), 'utf8'); } catch { return []; }
  const start = nav.indexOf('export function getNavigationItems');
  const lines = nav.slice(start).split(/\r?\n/);
  const modules = [];
  let cur = null;
  for (const line of lines) {
    const k = line.match(/^ {6}key:\s*'([^']+)'/);
    if (k) { cur = { key: k[1], label: k[1], hrefs: [] }; modules.push(cur); continue; }
    if (!cur) continue;
    const l = line.match(/^ {6}label:\s*(?:t\('[^']*',\s*)?'([^']+)'/);
    if (l) cur.label = l[1];
    for (const h of line.matchAll(/href:\s*'([^']+)'/g)) if (!cur.hrefs.includes(h[1])) cur.hrefs.push(h[1]);
  }
  return modules.filter((m) => m.hrefs.length);
}

/** The sidebar module a route belongs to: longest sidebar href that is the route or a parent of it. */
export function moduleOf(modules, url) {
  let best = null;
  for (const m of modules) for (const h of m.hrefs) {
    if ((url === h || url.startsWith(h + '/')) && (!best || h.length > best.h.length)) best = { m, h };
  }
  if (best) return best.m.key;
  // Not under any sidebar link (e.g. /students/import): the module that owns most sidebar
  // links with the same first segment — but only when one module clearly owns it
  // (/admin/* is spread over several modules and stays unassigned).
  const seg = '/' + (url.split('/')[1] || '');
  const counts = modules.map((m) => ({ m, n: m.hrefs.filter((h) => h === seg || h.startsWith(seg + '/')).length })).filter((x) => x.n).sort((a, b) => b.n - a.n);
  if (counts.length && (counts.length === 1 || counts[0].n > counts.slice(1).reduce((s, x) => s + x.n, 0))) return counts[0].m.key;
  return null;
}

export function buildIndex(root) {
  const all = listSourceFiles(root);
  const exists = new Set(all);
  // Directories next to src that imports may resolve into (json, css) are not needed — only code.
  const tests = [];
  const files = {};
  for (const f of all) {
    if (isTestFile(f)) { tests.push(f); continue; }
    try { files[f] = analyseFile(root, f, exists); } catch (e) { files[f] = { file: f, error: String(e.message || e) }; }
  }

  // Test files: which source files and URLs they touch
  const testRefs = {};
  for (const t of tests) {
    const text = fs.readFileSync(path.join(root, t), 'utf8');
    const refs = new Set();
    for (const m of text.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)) {
      const r = resolveImport(root, t, m[1], exists); if (typeof r !== 'string') continue;
      if (r) refs.add(r);
    }
    for (const m of text.matchAll(/['"`](\/api\/[A-Za-z0-9_\-/[\]]+)/g)) refs.add('url:' + m[1].replace(/\/+$/, ''));
    testRefs[t] = [...refs];
  }

  // Keep only real tables (drops aliases and sub-query names the regex picks up)
  const tables = knownTables(root, all.filter((f) => !isTestFile(f)));
  for (const info of Object.values(files)) if (info.sqlTables) info.sqlTables = info.sqlTables.filter((t) => tables.has(t));

  // Reverse import graph
  const dependants = {};
  for (const [f, info] of Object.entries(files)) {
    for (const imp of [...(info.imports || []), ...(info.dynamicImports || [])]) {
      if (imp.resolved) (dependants[imp.resolved] ??= new Set()).add(f);
    }
  }

  // Routes
  const publicRoutes = readPublicRoutes(root);
  const nav = readNavigation(root);
  const modules = readModules(root);
  const routes = {};   // url → { url, page, route, layouts[], loading[], error[], ... }
  const apiPatterns = [];
  for (const f of Object.keys(files)) {
    const r = appRouteOf(f);
    if (!r) continue;
    const node = (routes[r.url] ??= { url: r.url, files: {} });
    if (r.special === 'page' || r.special === 'route') {
      if (node.files[r.special]) (node.duplicates ??= []).push(f);
      else node.files[r.special] = f;
    }
    if (r.special === 'route') apiPatterns.push({ url: r.url, re: routePattern(r.url), file: f });
    node.dirs ??= [];
    if (!node.dirs.includes(r.dir)) node.dirs.push(r.dir);
  }
  // Layout / loading / error chains: walk directories from src/app down to the route's directory.
  const specialByDir = {};
  for (const f of Object.keys(files)) {
    const r = appRouteOf(f);
    if (r && ['layout', 'loading', 'error', 'not-found', 'template'].includes(r.special)) (specialByDir[r.dir] ??= {})[r.special] = f;
  }
  for (const node of Object.values(routes)) {
    const f = node.files.page || node.files.route;
    if (!f) continue;
    const parts = path.posix.dirname(f).split('/');
    const chain = { layout: [], loading: [], error: [], 'not-found': [], template: [] };
    for (let i = 2; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      for (const k of Object.keys(chain)) if (specialByDir[dir]?.[k]) chain[k].push(specialByDir[dir][k]);
    }
    node.layouts = chain.layout;
    node.loading = chain.loading;
    node.errorBoundaries = chain.error;
    node.kind = node.files.page ? 'page' : 'api';
    node.public = publicRoutes.some((p) => node.url === p || node.url.startsWith(p + '/'));
    if (nav[node.url]) node.navLabel = nav[node.url];
    node.module = moduleOf(modules, node.url);
  }

  const matchApi = (url) => {
    const concrete = url.replace(/:param/g, 'x');
    const exact = apiPatterns.filter((p) => p.re.test(concrete));
    if (!exact.length) return null;
    // Prefer the most literal match (fewest dynamic segments)
    exact.sort((a, b) => (a.url.match(/\[/g) || []).length - (b.url.match(/\[/g) || []).length);
    return exact[0];
  };

  for (const info of Object.values(files)) {
    for (const r of info.requests || []) {
      if (r.importRef) {
        const v = files[r.importRef.from]?.constUrls?.[r.importRef.name];
        const n = v && normaliseRequestUrl(v);
        if (n) { r.url = n; r.via += ` (${r.importRef.name})`; } else r.unresolved = `${r.importRef.name} from ${r.importRef.from}`;
        delete r.importRef;
      }
      if (!r.url) continue;
      if (!r.url.startsWith('/api/')) { r.target = 'page'; continue; }
      const m = matchApi(r.url);
      if (m) {
        r.endpoint = m.url; r.endpointFile = m.file;
        const methods = files[m.file]?.httpMethods || [];
        if (r.method && r.method !== 'dynamic' && methods.length && !methods.includes(r.method)) r.methodMissing = true;
      } else {
        // `/api/devices/${serial}/${action}` — the last segment is chosen at run time; list what it can reach.
        const segs = r.url.split('/');
        const candidates = segs.includes(':param') ? apiPatterns.filter((p) => {
          const ps = p.url.split('/');
          return ps.length === segs.length && segs.every((s, i) => s === ':param' || s === ps[i] || /^\[.+\]$/.test(ps[i]));
        }).map((p) => p.url) : [];
        if (candidates.length) r.candidates = candidates;
        else r.endpointMissing = true;
      }
    }
  }

  // Tests per file (direct import, or URL hit for API routes)
  const testsFor = {};
  for (const [t, refs] of Object.entries(testRefs)) {
    for (const ref of refs) {
      if (ref.startsWith('url:')) { const m = matchApi(ref.slice(4)); if (m) (testsFor[m.file] ??= new Set()).add(t); }
      else (testsFor[ref] ??= new Set()).add(t);
    }
  }

  for (const [f, info] of Object.entries(files)) {
    info.dependants = [...(dependants[f] || [])].sort();
    info.tests = [...(testsFor[f] || [])].sort();
    const r = appRouteOf(f);
    if (r) info.route = { url: r.url, special: r.special };
    // A handler that imports nothing but next/* and names no table touches no data (retired 410 stubs).
    if (r?.special === 'route' && !info.error) {
      info.stub = info.imports.every((i) => i.category === 'next') && !info.dynamicImports.length && !info.sqlTables.length;
      // Handlers that hand the whole request to a module (offline route-bridges): auth lives there.
      if (!info.permissions.length && !info.sessionScoped && !info.authCalls.length && !info.stub) {
        info.authDelegatedTo = [...info.dynamicImports, ...info.imports]
          .map((i) => i.resolved && files[i.resolved])
          .filter((m) => m && (m.sessionScoped || m.permissions?.length || m.authCalls?.length))
          .map((m) => m.file);
      }
    }
  }
  // Related tests: tests of the modules this file imports, and of the API routes it calls.
  // A page itself is rarely imported by a test; what protects it is the logic it delegates to.
  for (const info of Object.values(files)) {
    const rel = new Set();
    for (const imp of info.imports || []) if (imp.resolved) for (const t of testsFor[imp.resolved] || []) rel.add(t);
    for (const r of info.requests || []) if (r.endpointFile) for (const t of testsFor[r.endpointFile] || []) rel.add(t);
    for (const t of info.tests || []) rel.delete(t);
    info.relatedTests = [...rel].sort();
  }

  return { files, routes, tests, testRefs, modules };
}

/** Which page sections have content, are verifiably empty, or need a human. */
export function completeness(index, url) {
  const node = index.routes[url];
  if (!node) return null;
  const f = index.files[node.files.page || node.files.route];
  if (!f) return null;
  const s = {};
  s.architecture = 'derived';
  s.dataFlow = f.requests.some((r) => r.unresolved) ? 'needs-review' : f.requests.length || f.sqlTables.length ? 'derived' : 'none-found';
  s.components = f.rendered.some((r) => r.source === 'unknown') ? 'needs-review' : f.rendered.length ? 'derived' : 'none-found';
  s.hooks = f.hooks.length ? 'derived' : 'none-found';
  s.permissions = f.permissions.length || f.sessionScoped || f.authCalls?.length || f.stub || f.authDelegatedTo?.length || node.public ? 'derived' : node.kind === 'api' ? 'needs-review' : 'inherited';
  s.tests = f.tests.length ? 'derived' : f.relatedTests?.length ? 'related-only' : 'none-found';
  s.purpose = f.header ? 'derived' : 'needs-review';
  return s;
}
