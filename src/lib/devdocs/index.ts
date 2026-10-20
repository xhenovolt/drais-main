/**
 * Server-side reader for the generated developer-documentation index
 * (scripts/devdocs/generate.mjs → src/generated/devdocs/index.json).
 *
 * The index is several MB, so it is read once per server process and never
 * sent to the browser whole: the Control Center docs ask for the tree, one
 * route, one file, or a page of search results at a time.
 */
import fs from 'node:fs';
import path from 'node:path';
import { DOCS } from '@/app/control/docs/registry';
import { GUIDE_INDEX } from '@/app/control/docs/routes/guide-index';

export type Completeness = Record<string, 'derived' | 'none-found' | 'needs-review' | 'inherited' | 'related-only'>;

export interface RouteNode {
  url: string;
  kind: 'page' | 'api';
  files: { page?: string; route?: string };
  dirs: string[];
  layouts: string[];
  loading: string[];
  errorBoundaries: string[];
  public: boolean;
  navLabel?: string;
  duplicates?: string[];
  completeness: Completeness | null;
}

export interface DevIndex {
  generatedAt: string;
  commit: string | null;
  stats: Record<string, number>;
  files: Record<string, any>;
  routes: Record<string, RouteNode>;
  tests: string[];
}

export const INDEX_PATH = path.join(process.cwd(), 'src/generated/devdocs/index.json');

let cached: { mtime: number; index: DevIndex; search: SearchEntry[] } | null = null;

/** null when the index has not been generated in this checkout/build. */
export function loadIndex(): { index: DevIndex; search: SearchEntry[] } | null {
  let st: fs.Stats;
  try { st = fs.statSync(INDEX_PATH); } catch { return null; }
  if (cached && cached.mtime === st.mtimeMs) return cached;
  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')) as DevIndex;
  cached = { mtime: st.mtimeMs, index, search: buildSearch(index) };
  return cached;
}

// ─── Search ──────────────────────────────────────────────────────────────────

export type SearchCategory = 'route' | 'api' | 'file' | 'component' | 'hook' | 'function' | 'concept' | 'guide' | 'problem';

export interface SearchEntry {
  cat: SearchCategory;
  /** What is shown and matched first. */
  label: string;
  /** Second line: file path, route, blurb. */
  detail: string;
  /** Where the result opens. */
  href: string;
  /** Extra lower-weight match text. */
  terms: string;
}

const routeHref = (url: string) => `/control/docs/routes${url === '/' ? '' : url.split('/').map(encodeURIComponent).join('/')}`;
const fileHref = (file: string, line?: number) => `/control/docs/files/${file.split('/').map(encodeURIComponent).join('/')}${line ? `#L${line}` : ''}`;
export { routeHref, fileHref };

/** Exposed for the tests, which build the index in-process instead of reading the file. */
export const __buildSearchForTest = (index: DevIndex) => buildSearch(index);

function buildSearch(index: DevIndex): SearchEntry[] {
  const out: SearchEntry[] = [];
  for (const r of Object.values(index.routes)) {
    const f = index.files[r.files.page || r.files.route || ''];
    out.push({
      cat: r.kind === 'api' ? 'api' : 'route',
      label: r.url,
      detail: (r.kind === 'api' ? (f?.httpMethods || []).join(' ') + ' · ' : r.navLabel ? r.navLabel + ' · ' : '') + (r.files.page || r.files.route),
      href: routeHref(r.url),
      terms: [r.navLabel, ...(f?.sqlTables || []), ...(f?.permissions || []).map((p: any) => p.code)].filter(Boolean).join(' '),
    });
  }
  for (const f of Object.values(index.files)) {
    out.push({ cat: 'file', label: f.file, detail: `${f.lines} lines${f.directive ? ' · ' + f.directive : ''}`, href: fileHref(f.file), terms: (f.header || '').slice(0, 300) });
    for (const d of f.declarations || []) {
      if (d.kind === 'component' || d.kind === 'hook' || (d.kind === 'function' && d.exported)) {
        out.push({
          cat: d.kind === 'component' ? 'component' : d.kind === 'hook' ? 'hook' : 'function',
          label: d.name,
          detail: `${f.file}:${d.start}`,
          href: fileHref(f.file, d.start),
          terms: (d.doc || '').slice(0, 200),
        });
      }
    }
    for (const r of f.requests || []) {
      if (r.endpointMissing) out.push({ cat: 'problem', label: `${r.method || 'GET'} ${r.url} — endpoint does not exist`, detail: `${f.file}:${r.line}`, href: fileHref(f.file, r.line), terms: 'missing endpoint 404 dead call broken' });
    }
    for (const i of f.imports || []) {
      if (i.broken) out.push({ cat: 'problem', label: `import '${i.spec}' does not resolve${i.caseMismatch ? ' on Linux (letter case)' : ''}`, detail: `${f.file}:${i.line}`, href: fileHref(f.file, i.line), terms: 'broken import module not found case sensitive' });
    }
  }
  for (const d of DOCS) out.push({ cat: 'concept', label: d.title, detail: d.blurb, href: `/control/docs/${d.slug}`, terms: [d.section, ...d.topics, ...d.keywords].join(' ') });
  for (const g of GUIDE_INDEX) out.push({ cat: 'guide', label: g.title, detail: g.target, href: g.target.startsWith('/') ? routeHref(g.target) : fileHref(g.target), terms: g.keywords.join(' ') });
  return out;
}

const CAT_WEIGHT: Record<SearchCategory, number> = { guide: 30, concept: 25, route: 20, api: 12, component: 15, hook: 15, function: 8, file: 6, problem: 4 };

/**
 * Case-insensitive, partial, multi-token search. Every token must appear somewhere
 * (label, detail or terms); label hits outrank the rest. Returns at most `limit`.
 */
export function search(entries: SearchEntry[], q: string, cat?: string | null, limit = 60): { total: number; results: SearchEntry[] } {
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return { total: 0, results: [] };
  const phrase = q.toLowerCase().trim();
  const scored: Array<{ e: SearchEntry; s: number }> = [];
  for (const e of entries) {
    if (cat && e.cat !== cat) continue;
    const label = e.label.toLowerCase();
    const detail = e.detail.toLowerCase();
    const terms = e.terms.toLowerCase();
    let s = 0;
    let all = true;
    for (const t of tokens) {
      if (label === t) s += 100;
      else if (label.startsWith(t) || label.includes('/' + t)) s += 50;
      else if (label.includes(t)) s += 30;
      else if (detail.includes(t)) s += 12;
      else if (terms.includes(t)) s += 8;
      else { all = false; break; }
    }
    if (!all) continue;
    if (label.includes(phrase)) s += 40;
    s += CAT_WEIGHT[e.cat];
    s -= Math.min(20, e.label.length / 8); // shorter, more specific labels first
    scored.push({ e, s });
  }
  scored.sort((a, b) => b.s - a.s || a.e.label.localeCompare(b.e.label));
  return { total: scored.length, results: scored.slice(0, limit).map((x) => x.e) };
}

// ─── Shapes sent to the browser ──────────────────────────────────────────────

/** A compact description of a file, for lists of dependencies. */
export function fileSummary(index: DevIndex, file: string) {
  const f = index.files[file];
  if (!f) return { file, missing: true };
  const firstLine = (f.header || '').split('\n').find((l: string) => l.trim()) || null;
  return {
    file, lines: f.lines, directive: f.directive, summary: firstLine,
    httpMethods: f.httpMethods, sqlTables: f.sqlTables, permissions: f.permissions, sessionScoped: f.sessionScoped,
    route: f.route || null,
  };
}

export function routeDetail(index: DevIndex, url: string) {
  const node = index.routes[url];
  if (!node) return null;
  const main = node.files.page || node.files.route!;
  const f = index.files[main];
  const endpoints = [...new Set((f.requests || []).map((r: any) => r.endpointFile).filter(Boolean))] as string[];
  const localComponents = (f.rendered || []).map((r: any) => r.source).filter((s: string) => typeof s === 'string' && s.startsWith('src/')) as string[];
  const children = Object.keys(index.routes).filter((u) => u !== url && u.startsWith(url === '/' ? '/' : url + '/') && u.split('/').length === url.split('/').length + (url === '/' ? 0 : 1)).sort();
  return {
    node,
    file: f,
    layouts: node.layouts.map((l) => fileSummary(index, l)),
    loading: node.loading, errorBoundaries: node.errorBoundaries,
    endpoints: endpoints.map((e) => fileSummary(index, e)),
    components: [...new Set(localComponents)].map((c) => fileSummary(index, c)),
    children,
  };
}

/** Files whose requests resolve to this API route (literal or templated URLs only). */
export function routeCallers(index: DevIndex, url: string) {
  const out: Array<{ file: string; line: number; method: string | null }> = [];
  for (const f of Object.values(index.files)) {
    for (const r of f.requests || []) {
      if (r.endpoint === url || r.candidates?.includes(url)) out.push({ file: f.file, line: r.line, method: r.method });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
}

export function fileDetail(index: DevIndex, file: string) {
  const f = index.files[file];
  if (!f) return null;
  return {
    file: f,
    dependants: (f.dependants || []).slice(0, 200).map((d: string) => fileSummary(index, d)),
    dependantCount: (f.dependants || []).length,
  };
}

/** For each documentation section, how many routes of this kind are in each completeness state. */
export function coverage(index: DevIndex, kind: 'page' | 'api') {
  const out: Record<string, Record<string, number>> = {};
  for (const r of Object.values(index.routes)) {
    if (r.kind !== kind || !r.completeness) continue;
    for (const [section, state] of Object.entries(r.completeness)) {
      (out[section] ||= {})[state] = (out[section][state] || 0) + 1;
    }
  }
  return out;
}

/** Route tree for navigation: url, kind, label and a completeness score only. */
export function routeTree(index: DevIndex, kind: 'page' | 'api') {
  return Object.values(index.routes)
    .filter((r) => r.kind === kind)
    .map((r) => ({
      url: r.url, label: r.navLabel || null,
      score: r.completeness ? Object.values(r.completeness).filter((v) => v === 'derived' || v === 'none-found' || v === 'inherited').length : 0,
      of: r.completeness ? Object.keys(r.completeness).length : 0,
      guide: GUIDE_INDEX.some((g) => g.target === r.url),
    }))
    .sort((a, b) => a.url.localeCompare(b.url));
}
