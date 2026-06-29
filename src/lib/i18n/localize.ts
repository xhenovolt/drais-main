/**
 * Server-side localization helpers for DB-backed display names.
 *
 * Arabic is always ADDITIVE: a NULL/empty `*_ar` value falls back to the
 * English value, so existing English API consumers are never affected. APIs
 * keep returning the original `name` field unchanged and add `name_ar` +
 * `display_name` (the language-appropriate pick).
 */
import type { NextRequest } from 'next/server';

export type Lang = 'en' | 'ar';

/** Normalise any input to a supported language, defaulting to English. */
export function asLang(v: unknown): Lang {
  return v === 'ar' ? 'ar' : 'en';
}

/**
 * Resolve the request language without coupling to any one transport. Checks,
 * in order: `?lang=` query param, `x-lang` header, `lang` cookie. Defaults to
 * 'en'. The client (which owns the language in its theme store) can pass any of
 * these; absence simply yields English.
 */
export function langFromRequest(req: NextRequest): Lang {
  const q = req.nextUrl?.searchParams?.get('lang');
  if (q) return asLang(q);
  const h = req.headers.get('x-lang');
  if (h) return asLang(h);
  const c = req.cookies?.get('lang')?.value;
  return asLang(c);
}

/** Pick the language-appropriate name, falling back to English when the Arabic
 *  value is missing/blank. */
export function pickName(lang: Lang, name?: string | null, nameAr?: string | null): string {
  const en = (name ?? '').toString();
  if (lang !== 'ar') return en;
  const ar = (nameAr ?? '').toString().trim();
  return ar || en;
}

/**
 * Attach `display_name` to a row that has `name` (+ optional `name_ar`). Returns
 * a new object; the original `name`/`name_ar` are preserved so both EN and AR
 * consumers work. Pass `arField` when the Arabic column isn't literally
 * `name_ar` (e.g. `subject_name_ar`).
 */
export function withDisplayName<T extends Record<string, unknown>>(
  row: T,
  lang: Lang,
  nameField: keyof T = 'name' as keyof T,
  arField: keyof T = 'name_ar' as keyof T,
): T & { display_name: string } {
  return {
    ...row,
    display_name: pickName(lang, row[nameField] as string | null, row[arField] as string | null),
  };
}

/** Compose an Arabic full name from people parts, falling back to English when
 *  a given part has no Arabic translation. `full_name_ar` wins if present. */
export function personDisplayName(
  lang: Lang,
  parts: {
    first_name?: string | null; last_name?: string | null; other_name?: string | null;
    first_name_ar?: string | null; last_name_ar?: string | null; other_name_ar?: string | null;
    full_name_ar?: string | null;
  },
): string {
  const en = [parts.first_name, parts.other_name, parts.last_name].filter(Boolean).join(' ').trim();
  if (lang !== 'ar') return en;
  const explicit = (parts.full_name_ar ?? '').trim();
  if (explicit) return explicit;
  const ar = [
    (parts.first_name_ar ?? '').trim() || parts.first_name,
    (parts.other_name_ar ?? '').trim() || parts.other_name,
    (parts.last_name_ar ?? '').trim() || parts.last_name,
  ].filter(Boolean).join(' ').trim();
  return ar || en;
}
