/**
 * Language-aware formatting for dates, numbers and money — PURE.
 *
 * Rule for Arabic (owner decision, 2026-10): the interface keeps WESTERN digits (0123) and the
 * GREGORIAN calendar, with Arabic month and day names. Reports keep their own per-report numeral
 * setting (src/lib/snapshots/normalizers.ts). Stored values are never changed, only how they show.
 *
 * Use these instead of toLocaleDateString('en-GB') / toLocaleString() in components. In a
 * component, prefer the bound versions from useI18n(): const { formatDate, formatNumber } = useI18n().
 */
export type FormatLang = 'en' | 'ar' | string;

/** BCP-47 tag for a DRAIS language. Arabic pins latin digits + the Gregorian calendar. */
export function localeFor(lang: FormatLang): string {
  return lang === 'ar' ? 'ar-u-nu-latn-ca-gregory' : 'en-GB';
}

type DateInput = Date | string | number | null | undefined;
function toDate(value: DateInput): Date | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type DateStyle = 'short' | 'medium' | 'long' | 'time' | 'datetime';
const DATE_STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: '2-digit', month: '2-digit', year: 'numeric' },                       // 12/10/2026
  medium: { day: '2-digit', month: 'short', year: 'numeric' },                         // 12 Oct 2026
  long: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },           // Monday, 12 October 2026
  time: { hour: '2-digit', minute: '2-digit' },                                        // 08:18
  datetime: { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' },
};

/** Format a date. Returns `empty` (default "—") for a missing or invalid value, never "Invalid Date". */
export function formatDate(value: DateInput, lang: FormatLang, style: DateStyle | Intl.DateTimeFormatOptions = 'medium', empty = '—'): string {
  const d = toDate(value);
  if (!d) return empty;
  const options = typeof style === 'string' ? DATE_STYLES[style] : style;
  try { return new Intl.DateTimeFormat(localeFor(lang), options).format(d); }
  catch { return d.toISOString().slice(0, 10); }
}

/** Format a number with grouping. Non-numeric input returns `empty`. */
export function formatNumber(value: number | string | null | undefined, lang: FormatLang, options: Intl.NumberFormatOptions = {}, empty = '—'): string {
  if (value == null || value === '') return empty;
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return empty;
  try { return new Intl.NumberFormat(localeFor(lang), options).format(n); }
  catch { return String(n); }
}

/**
 * Format an amount with its currency code: "UGX 30,000" in English, "30,000 UGX" in Arabic.
 * The code stays in Latin letters in both languages (it is an identifier, not a word), and the
 * amount is wrapped in direction isolates so it does not reorder inside an Arabic sentence.
 */
export function formatMoney(amount: number | string | null | undefined, lang: FormatLang, currency = 'UGX', options: Intl.NumberFormatOptions = { maximumFractionDigits: 0 }, empty = '—'): string {
  const n = formatNumber(amount, lang, options, '');
  if (n === '') return empty;
  return lang === 'ar' ? `⁦${n} ${currency}⁩` : `${currency} ${n}`;
}

/** Format a ratio (0.42) or a ready percentage (42) as "42%". */
export function formatPercent(value: number | null | undefined, lang: FormatLang, isRatio = false, digits = 0, empty = '—'): string {
  if (value == null || !Number.isFinite(value)) return empty;
  return `${formatNumber(isRatio ? value * 100 : value, lang, { maximumFractionDigits: digits })}%`;
}
