/**
 * Translation core — PURE (no React, no DOM, no network), shared by the client provider
 * (src/components/i18n/I18nProvider.tsx) and the server helper (src/lib/i18nServer.ts) so both
 * resolve keys, plurals and placeholders identically.
 *
 * Key conventions: docs/localization/TRANSLATION_KEY_CONVENTIONS.md
 */
export type Lang = 'en' | 'ar';
export interface Dictionary { [key: string]: string | Dictionary }
export type TVars = Record<string, string | number>;

const PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

/** Dotted-path lookup. Returns the text, a plural group, or undefined. */
export function resolveKey(dict: Dictionary, path: string | null | undefined): string | Dictionary | undefined {
  if (!path) return undefined;
  let node: string | Dictionary | undefined = dict;
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object') return undefined;
    node = node[part];
  }
  return node;
}

/**
 * A plural entry is a group whose keys are all plural categories and that has `other`:
 *   { "one": "{{count}} learner", "other": "{{count}} learners" }
 * Arabic uses up to six (zero, one, two, few, many, other).
 */
export function isPluralEntry(node: unknown): node is Record<string, string> {
  if (!node || typeof node !== 'object') return false;
  const keys = Object.keys(node as object);
  return keys.length > 0 && keys.includes('other')
    && keys.every((k) => (PLURAL_CATEGORIES as readonly string[]).includes(k) && typeof (node as Record<string, unknown>)[k] === 'string');
}

/** Pick the plural form for `count` in `lang`, using the language's own rules (Intl.PluralRules). */
export function selectPlural(entry: Record<string, string>, count: number, lang: string): string {
  let category = 'other';
  try { category = new Intl.PluralRules(lang === 'ar' ? 'ar' : 'en').select(count); } catch { /* keep 'other' */ }
  return entry[category] ?? entry.other;
}

/** Replace every {{name}} with its value. Unknown placeholders are left as they are. */
export function interpolate(text: string, vars?: TVars): string {
  if (!vars) return text;
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));
}

/**
 * Resolve a key to display text.
 *   - plain text entry                → the text
 *   - plural entry + numeric `count`  → the form for that count
 *   - missing                         → `fallback`, else the key itself
 * `onMissing` lets the caller report keys that have no entry.
 */
export function translate(
  dict: Dictionary, lang: string, key: string, vars?: TVars, fallback?: string, onMissing?: (key: string) => void,
): string {
  const node = resolveKey(dict, key);
  let text: string;
  if (typeof node === 'string') text = node;
  else if (isPluralEntry(node)) text = selectPlural(node, Number(vars?.count ?? 0), lang);
  else { onMissing?.(key); text = fallback ?? key; }
  return interpolate(text, vars);
}

/** Every leaf key of a dictionary as a dotted path; a plural entry counts as ONE key. */
export function flattenKeys(dict: Dictionary, prefix = '', out: Record<string, string | Record<string, string>> = {}) {
  for (const [k, v] of Object.entries(dict)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[path] = v;
    else if (isPluralEntry(v)) out[path] = v;
    else flattenKeys(v, path, out);
  }
  return out;
}

/** The {{placeholder}} names used by a text or by any form of a plural entry, sorted. */
export function placeholdersOf(value: string | Record<string, string>): string[] {
  const texts = typeof value === 'string' ? [value] : Object.values(value);
  const names = new Set<string>();
  for (const t of texts) for (const m of t.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) names.add(m[1]);
  return [...names].sort();
}
