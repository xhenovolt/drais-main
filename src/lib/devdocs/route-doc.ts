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
  /** B — file map. Every file listed here has its notes below. */
  files: Array<{ path: string; role: string; shared: boolean }>;
  /** C — what each layout layer contributes to THIS route (the chain itself is generated). */
  layout: string;
  /** D — component tree, real names. */
  tree: string;
  /**
   * E–H — per file: notes keyed by import spec ("import:react"), top-level declaration
   * ("SETTINGS_TABS"), or member ("AttendanceSettingsPage.handleSave", "Page.effect#2",
   * "Page.[tab, setTab]", "Page.render#1"). Each is shown beside that code.
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
  const unknown = Object.keys(have).filter((k) => !required.includes(k) && !k.startsWith('block:'));
  return { required: required.length, explained: required.length - missing.length, missing, unknown };
}

export function routeDocStatus(doc: RouteDoc | undefined, files: Record<string, any>): { status: RouteDocStatus; reasons: string[] } {
  if (!doc) return { status: 'NOT STARTED', reasons: [] };
  const reasons: string[] = [];
  for (const s of REQUIRED_SECTIONS) {
    const v = (doc as any)[s];
    if (v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)) reasons.push(`section missing: ${s}`);
  }
  for (const f of doc.files) {
    const info = files[f.path];
    if (!info) { reasons.push(`file no longer exists: ${f.path}`); continue; }
    const cov = fileCoverage(info, doc.notes[f.path]);
    if (cov.missing.length) reasons.push(`${f.path}: ${cov.missing.length} of ${cov.required} units unexplained`);
    if (cov.unknown.length) reasons.push(`${f.path}: notes for code that no longer exists — ${cov.unknown.slice(0, 5).join(', ')}`);
  }
  if (reasons.length) return { status: 'IN PROGRESS', reasons };
  const changed = doc.files.filter((f) => doc.reviewed[f.path] !== files[f.path]?.sha).map((f) => f.path);
  if (changed.length) return { status: 'NEEDS REVIEW', reasons: changed.map((p) => `changed since review: ${p}`) };
  return doc.verified ? { status: 'VERIFIED', reasons: [] } : { status: 'DOCUMENTED', reasons: ['practical QA not yet recorded'] };
}
