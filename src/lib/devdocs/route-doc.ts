/**
 * Hand-written, implementation-level documentation for ONE route — the layer the
 * generated reference cannot provide: why the code is the way it is, what each
 * handler/effect/state really does, and how to change it safely.
 *
 * One file per route under src/app/control/docs/routes/docs/, registered in
 * ./route-docs.ts. Every reference is checked by src/lib/devdocs/__tests__:
 *   • `files` must exist; `notes` keys must name a real import, declaration or member
 *     (handler, state, effect#n, guard#n, render#n) of that file;
 *   • `reviewed` pins each file's content hash at review time — when the file changes,
 *     the route drops to NEEDS REVIEW until someone re-reads it and updates the hash.
 *
 * Text conventions (rendered by the docs UI): `code`, **bold**, blank line = new paragraph,
 * lines starting "- " = list. Tag statements that are not current behaviour:
 *   [defect] confirmed wrong · [recommended] preferred for new code ·
 *   [illustrative] teaching code that does not exist in DRAIS · [unverified] not yet checked.
 */

export interface RouteDoc {
  route: string;
  /** Content hash of every file this doc explains, at the time it was reviewed (from the index). */
  reviewed: Record<string, string>;
  /** Set only after the practical QA questions were answered from this doc alone. */
  verified?: { date: string; qa: Record<QaQuestion, string> };

  /** A — identity */
  identity: { purpose: string; users: string; permissions: string; upstream: string; downstream: string };
  /** B — file map. Every file listed here has its notes below. `lineLevel`: every code line of
   *  the file must also sit inside a `lines:<from>-<to>` note (see lineCoverage). */
  files: Array<{ path: string; role: string; shared: boolean; lineLevel?: boolean }>;
  /** C — what each layout layer contributes to THIS route (the chain itself is generated). */
  layout: string;
  /** D — component tree, real names. */
  tree: string;
  /**
   * E–H — per file: notes keyed by import spec ("import:react"), top-level declaration
   * ("SETTINGS_TABS"), or member ("AttendanceSettingsPage.handleSave", "Page.effect#2",
   * "Page.[tab, setTab]", "Page.render#1"). Each is shown beside that code.
   * Line-level notes: "lines:120-134" (or "lines:120") explain that exact range; the
   * walkthrough splits each unit's code into these slices, each beside its own note.
   */
  notes: Record<string, Record<string, string>>;
  /** I — the rendered UI, section by section. */
  ui: Array<{ title: string; text: string }>;
  /** J — user action → … → UI update, only the stages that exist. */
  interactions: Array<{ action: string; steps: string[] }>;
  /** K — data contracts */
  data: string;
  /** L — loading / empty / error states */
  states: string;
  /** M — security and business rules, each tied to its enforcement point */
  security: string;
  /** N — styling and responsive behaviour */
  styling: string;
  /** O — tests and debugging */
  testing: string;
  /** P — safe extension guide for this route */
  extend: Array<{ change: string; how: string }>;
}

export const QA_QUESTIONS = {
  where: 'Where is the route implemented?',
  layouts: 'Which layouts and shared components affect it?',
  data: 'How does it obtain its data?',
  hooks: 'Which hooks and functions control its behaviour?',
  click: 'What happens when its main button is clicked?',
  validation: 'How does validation work?',
  failures: 'How does the route handle failures?',
  security: 'Which security constraints apply?',
  change: 'Which files change for a typical enhancement?',
  tests: 'Which tests should be run?',
} as const;
export type QaQuestion = keyof typeof QA_QUESTIONS;

export type RouteDocStatus = 'NOT STARTED' | 'IN PROGRESS' | 'DOCUMENTED' | 'NEEDS REVIEW' | 'VERIFIED';

export const REQUIRED_SECTIONS = ['identity', 'files', 'layout', 'tree', 'notes', 'ui', 'interactions', 'data', 'states', 'security', 'styling', 'testing', 'extend'] as const;

/** Every unit in a file that needs a note: meaningful imports, top-level declarations, members. */
export function noteKeysFor(file: any): string[] {
  if (!file) return [];
  const keys: string[] = [];
  for (const i of file.imports || []) if (!i.typeOnly) keys.push(`import:${i.spec}`);
  for (const d of file.declarations || []) {
    keys.push(d.name);
    for (const m of d.members || []) keys.push(`${d.name}.${m.name}`);
  }
  return [...new Set(keys)];
}

export interface Coverage { required: number; explained: number; missing: string[]; unknown: string[] }

/** How much of a file a doc explains, and which note keys point at nothing (stale). */
export function fileCoverage(file: any, notes: Record<string, string> | undefined): Coverage {
  const required = noteKeysFor(file);
  const have = notes || {};
  const missing = required.filter((k) => !have[k]?.trim());
  const unknown = Object.keys(have).filter((k) => !required.includes(k) && !k.startsWith('block:') && !k.startsWith('lines:'));
  return { required: required.length, explained: required.length - missing.length, missing, unknown };
}

// ─── Line-level notes ───────────────────────────────────────────────────────

export interface LineRange { key: string; from: number; to: number }

/** Units up to this many lines are explained by their unit note alone (a `useState`, a guard, a const). */
export const SHORT_UNIT_LINES = 6;

/** "lines:12-30" → {12, 30}; "lines:12" → {12, 12}; anything else → null. */
export function parseLineKey(key: string): LineRange | null {
  const m = /^lines:(\d+)(?:-(\d+))?$/.exec(key);
  if (!m) return null;
  const from = Number(m[1]); const to = m[2] ? Number(m[2]) : from;
  return { key, from, to };
}

/** Line notes of a file, sorted by start line. */
export function lineRanges(notes: Record<string, string> | undefined): LineRange[] {
  return Object.keys(notes || {}).map(parseLineKey).filter((r): r is LineRange => !!r && !!notes![r.key]?.trim()).sort((a, b) => a.from - b.from);
}

/** Line numbers (1-based) that are code: not blank and not comment-only. A line inside a block
 *  comment counts as comment. Comments explain themselves; code lines need a line note. */
export function codeLineNumbers(source: string): number[] {
  const out: number[] = [];
  let inBlock = false;
  source.split(/\r?\n/).forEach((raw, i) => {
    const s = raw.trim();
    if (inBlock) {
      if (s.includes('*/')) { inBlock = false; const rest = s.slice(s.indexOf('*/') + 2).trim(); if (rest && rest !== '}') out.push(i + 1); }
      return;
    }
    if (!s || s.startsWith('//')) return;
    if (s.startsWith('/*') || s.startsWith('{/*')) {
      if (!s.includes('*/')) { inBlock = true; return; }
      const rest = s.slice(s.indexOf('*/') + 2).trim();
      if (rest && rest !== '}') out.push(i + 1);
      return;
    }
    out.push(i + 1);
  });
  return out;
}

/** Collapse sorted numbers into "a–b" ranges for messages. */
export function compressLines(ns: number[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < ns.length; i++) {
    let j = i; while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
    out.push(ns[i] === ns[j] ? String(ns[i]) : `${ns[i]}–${ns[j]}`); i = j;
  }
  return out;
}

/** The unit spans the walkthrough renders (imports block, declaration heads, members). */
export function unitSpans(file: any): Array<{ id: string; from: number; to: number }> {
  if (!file) return [];
  const spans: Array<{ id: string; from: number; to: number }> = [];
  const imports = (file.imports || []).filter((i: any) => !i.typeOnly);
  if (imports.length) spans.push({ id: 'imports', from: Math.min(...imports.map((i: any) => i.line)), to: Math.max(...imports.map((i: any) => i.line)) });
  for (const d of file.declarations || []) {
    const ms = d.members || [];
    spans.push({ id: d.name, from: d.start, to: ms.length ? Math.max(d.start, ms[0].start - 1) : d.end });
    for (const m of ms) spans.push({ id: `${d.name}.${m.name}`, from: m.start, to: m.end });
  }
  return spans;
}

export interface LineCoverage { code: number; covered: number; uncovered: number[]; overlaps: string[]; invalid: string[]; crossing: string[] }

/** How much of a line-level file the line notes cover, plus structural problems with the notes. */
export function lineCoverage(file: any, source: string, notes: Record<string, string> | undefined): LineCoverage {
  const total = source.split(/\r?\n/).length;
  const ranges = lineRanges(notes);
  const invalid = ranges.filter((r) => r.from < 1 || r.to < r.from || r.to > total).map((r) => r.key);
  const overlaps: string[] = [];
  for (let i = 1; i < ranges.length; i++) if (ranges[i].from <= ranges[i - 1].to) overlaps.push(`${ranges[i - 1].key} / ${ranges[i].key}`);
  // A note must stay inside the innermost unit that contains its first line, so it renders in one place.
  const spans = unitSpans(file);
  const crossing = ranges.filter((r) => {
    const inner = spans.filter((s) => s.from <= r.from && r.from <= s.to).sort((a, b) => (a.to - a.from) - (b.to - b.from))[0];
    return inner ? r.to > inner.to : spans.some((s) => s.from > r.from && s.from <= r.to);
  }).map((r) => r.key);
  const coveredSet = new Set<number>();
  for (const r of ranges) for (let n = r.from; n <= r.to; n++) coveredSet.add(n);
  // A short unit (≤ SHORT_UNIT_LINES) with its own note is already explained line by line, and the
  // import block is explained once every import has its note — no duplicate line notes needed.
  const have = notes || {};
  const imports = (file?.imports || []).filter((i: any) => !i.typeOnly);
  for (const s of spans) {
    const explained = s.id === 'imports' ? imports.every((i: any) => have[`import:${i.spec}`]?.trim()) : (s.to - s.from + 1 <= SHORT_UNIT_LINES && !!have[s.id]?.trim());
    if (explained) for (let n = s.from; n <= s.to; n++) coveredSet.add(n);
    // The unit note explains the unit's own declaration line and closing line (`const f = async () => {` … `};`).
    else if (s.id !== 'imports' && have[s.id]?.trim()) { coveredSet.add(s.from); coveredSet.add(s.to); }
  }
  for (const d of file?.declarations || []) if (have[d.name]?.trim()) { coveredSet.add(d.start); coveredSet.add(d.end); }
  if (imports.length && imports.every((i: any) => have[`import:${i.spec}`]?.trim())) {
    // Multi-line import statements end after their first line; cover through the closing `from '…'`.
    const lines = source.split(/\r?\n/);
    const last = Math.max(...imports.map((i: any) => i.line));
    for (let n = last; n <= lines.length && n <= last + 60; n++) { coveredSet.add(n); if (/from\s+['"]/.test(lines[n - 1]) || /^import\s+['"]/.test(lines[n - 1].trim())) break; }
  }
  const code = codeLineNumbers(source);
  const uncovered = code.filter((n) => !coveredSet.has(n));
  return { code: code.length, covered: code.length - uncovered.length, uncovered, overlaps, invalid, crossing };
}

/** A file's notes merged from every document — a shared component is explained once and counts everywhere. */
export function mergedNotes(docs: RouteDoc[], file: string): Record<string, string> {
  return Object.assign({}, ...docs.map((d) => d.notes[file] || {}));
}

export function routeDocStatus(
  doc: RouteDoc | undefined, files: Record<string, any>, allDocs: RouteDoc[] = doc ? [doc] : [],
  /** Source text per file — needed only for `lineLevel` files; without it their line coverage is not checked. */
  source?: (path: string) => string | null,
): { status: RouteDocStatus; reasons: string[] } {
  if (!doc) return { status: 'NOT STARTED', reasons: [] };
  const reasons: string[] = [];
  for (const s of REQUIRED_SECTIONS) {
    const v = (doc as any)[s];
    if (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) reasons.push(`section missing: ${s}`);
  }
  for (const f of doc.files) {
    const info = files[f.path];
    if (!info) { reasons.push(`file no longer exists: ${f.path}`); continue; }
    const cov = fileCoverage(info, mergedNotes(allDocs, f.path));
    if (cov.missing.length) reasons.push(`${f.path}: ${cov.missing.length} of ${cov.required} units unexplained`);
    if (cov.unknown.length) reasons.push(`${f.path}: notes for code that no longer exists — ${cov.unknown.slice(0, 5).join(', ')}`);
    const text = f.lineLevel && source ? source(f.path) : null;
    if (text != null) {
      const lc = lineCoverage(info, text, mergedNotes(allDocs, f.path));
      if (lc.uncovered.length) reasons.push(`${f.path}: ${lc.uncovered.length} of ${lc.code} code lines without a line note (${compressLines(lc.uncovered).slice(0, 4).join(', ')}${lc.uncovered.length > 4 ? ', …' : ''})`);
      if (lc.overlaps.length) reasons.push(`${f.path}: overlapping line notes ${lc.overlaps.slice(0, 3).join(', ')}`);
      if (lc.invalid.length) reasons.push(`${f.path}: line notes outside the file ${lc.invalid.slice(0, 3).join(', ')}`);
      if (lc.crossing.length) reasons.push(`${f.path}: line notes crossing a unit boundary ${lc.crossing.slice(0, 3).join(', ')}`);
    }
  }
  if (reasons.length) return { status: 'IN PROGRESS', reasons };
  // Only files this doc reviewed itself (shared files explained elsewhere are pinned by that doc).
  const changed = doc.files.filter((f) => doc.reviewed[f.path] && doc.reviewed[f.path] !== files[f.path]?.sha).map((f) => f.path);
  if (changed.length) return { status: 'NEEDS REVIEW', reasons: changed.map((p) => `changed since review: ${p}`) };
  return doc.verified ? { status: 'VERIFIED', reasons: [] } : { status: 'DOCUMENTED', reasons: ['practical QA not yet recorded'] };
}
