/**
 * Pure normalization helpers for snapshot generation.
 *
 * Determinism rules:
 *   - No `Date.now()`, `Math.random()`, or `Object.keys()` over unsorted data
 *     in any function whose output flows into `snapshot.classes`.
 *   - `canonicalStringify` produces identical bytes for identical inputs.
 *
 * Arabic-numeral helpers are verbatim from
 * src/app/academics/theology-emergency-reports/route.ts:9-50.
 */
import { createHash } from 'node:crypto';

const ARABIC_TO_WESTERN: Record<string, string> = {
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
  '٫': '.',
};

const WESTERN_TO_ARABIC: Record<string, string> = {
  '0': '٠', '1': '١', '2': '٢', '3': '٣', '4': '٤',
  '5': '٥', '6': '٦', '7': '٧', '8': '٨', '9': '٩',
  '.': '٫',
};

/**
 * Convert Arabic numerals (٠-٩, ٫) to Western (0-9, .) for parsing.
 * Pass-through for already-Western strings.
 */
export function arabicToWestern(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return '0';
  const str = String(input);
  return str.replace(/[٠-٩٫]/g, ch => ARABIC_TO_WESTERN[ch] ?? ch);
}

/**
 * Convert Western numerals to Arabic for display.
 */
export function toArabicNumerals(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return '٠';
  return String(value).replace(/[0-9.]/g, ch => WESTERN_TO_ARABIC[ch] ?? ch);
}

/**
 * Parse any score representation (Arabic, Western, mixed, "—", null) to a
 * Western number or null.
 */
export function parseScore(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const western = arabicToWestern(raw as string).trim();
  if (western === '' || western === '—' || western === '-') return null;
  const n = parseFloat(western);
  return Number.isFinite(n) ? n : null;
}

/**
 * Render a Western number for display in either numeral system.
 * Whole numbers drop the decimal; fractional values keep one decimal place.
 */
export function formatScoreForDisplay(score: number | null, numerals: 'arabic' | 'western'): string {
  if (score === null) return numerals === 'arabic' ? '—' : '—';
  const rounded = Math.round(score * 100) / 100;
  const isWhole = Number.isInteger(rounded);
  const str = isWhole ? rounded.toString() : rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return numerals === 'arabic' ? toArabicNumerals(str) : str;
}

/**
 * URL-safe slug, lowercase, alphanumeric + hyphen. Stable across calls.
 */
export function slugify(input: string): string {
  return String(input)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')           // strip combining diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'school';
}

/**
 * Deterministic JSON stringify with key-sorted objects.
 * Arrays preserve insertion order; the caller must pre-sort arrays where
 * order matters for hashing.
 */
export function canonicalStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  const visit = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v as object)) throw new Error('canonicalStringify: cycle detected');
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(visit);
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      sorted[k] = visit((v as Record<string, unknown>)[k]);
    }
    return sorted;
  };
  return JSON.stringify(visit(value));
}

/**
 * sha256 hex digest of the canonical stringification.
 */
export function hashCanonical(value: unknown): string {
  return createHash('sha256').update(canonicalStringify(value)).digest('hex');
}

/**
 * Filesystem-safe path segment (no slashes, no spaces).
 * Used only for snapshot metadata strings — actual data lives in DB.
 */
export function sanitizeSegment(input: string): string {
  return slugify(input);
}
