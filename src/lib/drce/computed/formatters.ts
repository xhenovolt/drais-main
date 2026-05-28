/**
 * Formatter pipes for the unified expression language.
 *
 *   {next_term_begins | date:"D MMM YYYY"}
 *   {fee_balance | number:"#,##0.00"}
 *   {student.fullName | upper}
 *   {comments.classTeacher | coalesce:"—" | truncate:120}
 *
 * Each formatter is a pure (value, ...args) → string. Unknown formatters
 * leave the value untouched and log once (silent in production renders).
 */
import type { ComputedValue } from './registry';

export type Formatter = (value: ComputedValue, ...args: string[]) => string;

function toDate(value: ComputedValue): Date | null {
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && value.trim()) {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const MONTHS_LONG  = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function fmtDate(d: Date, pattern: string): string {
  return pattern
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/YY/g,   String(d.getFullYear()).slice(-2))
    .replace(/MMMM/g, MONTHS_LONG[d.getMonth()])
    .replace(/MMM/g,  MONTHS_SHORT[d.getMonth()])
    .replace(/MM/g,   String(d.getMonth() + 1).padStart(2, '0'))
    .replace(/DD/g,   String(d.getDate()).padStart(2, '0'))
    .replace(/D/g,    String(d.getDate()));
}

function fmtNumber(value: ComputedValue, pattern: string): string {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  // Decimals from pattern (e.g. "#,##0.00" → 2)
  const dot = pattern.indexOf('.');
  const decimals = dot >= 0 ? pattern.length - dot - 1 : 0;
  const grouped  = pattern.includes(',');
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: grouped,
  });
}

const FORMATTERS: Record<string, Formatter> = {
  date(value, pattern = 'YYYY-MM-DD') {
    const d = toDate(value);
    return d ? fmtDate(d, pattern.replace(/^"|"$/g, '')) : '';
  },
  number(value, pattern = '#,##0') {
    return fmtNumber(value, pattern.replace(/^"|"$/g, ''));
  },
  percent(value, decimals = '1') {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return '';
    return `${n.toFixed(parseInt(decimals, 10) || 0)}%`;
  },
  upper(value) { return String(value ?? '').toUpperCase(); },
  lower(value) { return String(value ?? '').toLowerCase(); },
  title(value) { return String(value ?? '').replace(/\b\w/g, c => c.toUpperCase()); },
  coalesce(value, fallback = '—') {
    const s = value == null ? '' : String(value);
    return s.trim() === '' ? fallback.replace(/^"|"$/g, '') : s;
  },
  truncate(value, maxLen = '80') {
    const s = String(value ?? '');
    const max = parseInt(maxLen, 10) || 80;
    return s.length <= max ? s : s.slice(0, max - 1) + '…';
  },
  /** 1 → "1st", 22 → "22nd", 113 → "113th". */
  ordinal(value) {
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) return String(value ?? '');
    const i = Math.trunc(Math.abs(n));
    const tens = i % 100;
    if (tens >= 11 && tens <= 13) return `${n}th`;
    switch (i % 10) {
      case 1: return `${n}st`;
      case 2: return `${n}nd`;
      case 3: return `${n}rd`;
      default: return `${n}th`;
    }
  },
  /** {fee_balance | currency:"UGX,#,##0"} → "UGX 12,500". Symbol before the pattern, separated by space. */
  currency(value, spec = '"UGX,#,##0"') {
    const cleaned = spec.replace(/^"|"$/g, '');
    const comma = cleaned.indexOf(',');
    const symbol = comma >= 0 ? cleaned.slice(0, comma) : 'UGX';
    const pattern = comma >= 0 ? cleaned.slice(comma + 1) : '#,##0';
    return `${symbol} ${fmtNumber(value, pattern)}`;
  },
  /** Alias for coalesce — more discoverable in the editor variable picker. */
  default(value, fallback = '—') {
    const s = value == null ? '' : String(value);
    return s.trim() === '' ? fallback.replace(/^"|"$/g, '') : s;
  },
  /** Boolean rendering: {year_rollover | bool:"Next year","Same year"} */
  bool(value, ifTrue = '"Yes"', ifFalse = '"No"') {
    const truthy = value !== null && value !== undefined && value !== false
      && value !== '' && value !== 0 && value !== '0';
    return (truthy ? ifTrue : ifFalse).replace(/^"|"$/g, '');
  },
  /** Treat the value as a Date and produce a relative humanised string. */
  relative_date(value) {
    const d = toDate(value);
    if (!d) return '';
    const now = Date.now();
    const diffDays = Math.round((d.getTime() - now) / 86_400_000);
    if (diffDays === 0)  return 'today';
    if (diffDays === 1)  return 'tomorrow';
    if (diffDays === -1) return 'yesterday';
    if (diffDays > 0)    return `in ${diffDays} days`;
    return `${-diffDays} days ago`;
  },
};

export function applyFormatter(value: ComputedValue, name: string, args: string[]): string {
  const fn = FORMATTERS[name];
  if (!fn) return String(value ?? '');
  try { return fn(value, ...args); }
  catch { return String(value ?? ''); }
}

export function knownFormatters(): string[] {
  return Object.keys(FORMATTERS).sort();
}
