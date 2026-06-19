/**
 * Canonical academic term resolver — the single source of truth for
 * "what term is it?".
 *
 * Why this exists: term selection was scattered and broken. Terms carry
 * BOTH a legacy `status` ('draft'|'active'|…) and an `is_active` flag, and
 * the old getCurrentTerm matched on `status='active'` then fell back to
 * "latest term" — so a past term left `is_active=1` (status still 'draft')
 * was returned forever, and enrollment showed the wrong term. It also
 * INNER-JOINed academic_years, hiding terms whose AY row was missing.
 *
 * This resolver is DATE-DRIVEN first (today within [start,end] = current),
 * with an explicit, surfaced manual override (`is_active`). It never
 * silently keeps a stale term "current": if no term's dates cover today,
 * `current` is null and the caller is told the nearest upcoming + last
 * completed term, plus warnings.
 */
import { query } from '@/lib/db';

export interface ResolvedTerm {
  id: number;
  name: string;
  code: string | null;
  term_number: number | null;
  academic_year_id: number | null;
  academic_year_name: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;            // manual override flag
  stored_status: string | null; // legacy status column
  /** Derived from dates: 'upcoming' | 'current' | 'completed' | 'unknown'. */
  derived_status: 'upcoming' | 'current' | 'completed' | 'unknown';
}

export interface TermProgress {
  totalDays: number;
  daysElapsed: number;
  daysRemaining: number;
  percent: number;
}

export type TermWarning =
  | 'NO_CURRENT_TERM'
  | 'MULTIPLE_ACTIVE'
  | 'STALE_ACTIVE'          // is_active=1 but its dates are in the past
  | 'MANUAL_OVERRIDE_MISMATCH' // manual active differs from date-current term
  | 'NO_TERMS';

export interface TermContext {
  schoolId: number;
  /** Term whose [start,end] covers today (date truth). */
  current: ResolvedTerm | null;
  /** Term with is_active=1 (manual override). */
  manualActive: ResolvedTerm | null;
  /** What the app should USE: date-current, else null (never a stale term). */
  effective: ResolvedTerm | null;
  /** How `effective` was chosen. */
  source: 'date' | 'none';
  upcoming: ResolvedTerm | null;  // nearest future term
  previous: ResolvedTerm | null;  // most recently completed term
  progress: TermProgress | null;  // for `effective`
  warnings: TermWarning[];
  allTerms: ResolvedTerm[];
}

const DAY = 86_400_000;

function startOfDayMs(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Parse a stored term date (DATE/DATETIME) to the local calendar day in ms. */
function termDayMs(v: string | null, offsetMin: number): number | null {
  if (!v) return null;
  const t = Date.parse(typeof v === 'string' && v.length === 10 ? `${v}T00:00:00Z` : v);
  if (!Number.isFinite(t)) return null;
  // shift by school offset so we compare in the school's local calendar
  return startOfDayMs(new Date(t + offsetMin * 60_000));
}

function deriveStatus(startMs: number | null, endMs: number | null, todayMs: number): ResolvedTerm['derived_status'] {
  if (startMs == null || endMs == null) return 'unknown';
  if (todayMs < startMs) return 'upcoming';
  if (todayMs > endMs) return 'completed';
  return 'current';
}

/**
 * Resolve the full term context for a school.
 * @param offsetMin school UTC offset (minutes) for local-day comparison (default EAT +180).
 */
export async function resolveTermContext(schoolId: number, offsetMin = 180): Promise<TermContext> {
  const todayMs = startOfDayMs(new Date(Date.now() + offsetMin * 60_000));

  let rows: any[] = [];
  try {
    rows = (await query(
      `SELECT t.id, t.name, t.code, t.term_number, t.academic_year_id,
              t.start_date, t.end_date, t.is_active, t.status AS stored_status,
              ay.name AS academic_year_name
         FROM terms t
         LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
        WHERE t.school_id = ? AND t.deleted_at IS NULL
        ORDER BY t.start_date ASC, t.id ASC`,
      [schoolId],
    )) as any[];
  } catch {
    rows = [];
  }

  const terms: ResolvedTerm[] = rows.map((r) => {
    const s = termDayMs(r.start_date, offsetMin);
    const e = termDayMs(r.end_date, offsetMin);
    return {
      id: Number(r.id),
      name: r.name,
      code: r.code ?? null,
      term_number: r.term_number == null ? null : Number(r.term_number),
      academic_year_id: r.academic_year_id == null ? null : Number(r.academic_year_id),
      academic_year_name: r.academic_year_name ?? null,
      start_date: r.start_date ?? null,
      end_date: r.end_date ?? null,
      is_active: !!r.is_active,
      stored_status: r.stored_status ?? null,
      derived_status: deriveStatus(s, e, todayMs),
    };
  });

  const warnings: TermWarning[] = [];
  if (terms.length === 0) warnings.push('NO_TERMS');

  const current = terms.find((t) => t.derived_status === 'current') ?? null;
  const manualActives = terms.filter((t) => t.is_active);
  const manualActive = manualActives[0] ?? null;
  if (manualActives.length > 1) warnings.push('MULTIPLE_ACTIVE');
  if (manualActive && manualActive.derived_status === 'completed') warnings.push('STALE_ACTIVE');
  if (manualActive && current && manualActive.id !== current.id) warnings.push('MANUAL_OVERRIDE_MISMATCH');
  if (!current && terms.length > 0) warnings.push('NO_CURRENT_TERM');

  // Date truth wins. We deliberately do NOT fall back to a stale manual
  // term — that was the "Term I forever" bug.
  const effective = current;
  const source: TermContext['source'] = current ? 'date' : 'none';

  const upcoming = terms.filter((t) => t.derived_status === 'upcoming')
    .sort((a, b) => (termDayMs(a.start_date, offsetMin)! - termDayMs(b.start_date, offsetMin)!))[0] ?? null;
  const previous = terms.filter((t) => t.derived_status === 'completed')
    .sort((a, b) => (termDayMs(b.end_date, offsetMin)! - termDayMs(a.end_date, offsetMin)!))[0] ?? null;

  let progress: TermProgress | null = null;
  if (effective) {
    const s = termDayMs(effective.start_date, offsetMin);
    const e = termDayMs(effective.end_date, offsetMin);
    if (s != null && e != null && e >= s) {
      const totalDays = Math.round((e - s) / DAY) + 1;
      const daysElapsed = Math.min(totalDays, Math.max(0, Math.round((todayMs - s) / DAY) + 1));
      const daysRemaining = Math.max(0, totalDays - daysElapsed);
      progress = { totalDays, daysElapsed, daysRemaining, percent: totalDays > 0 ? Math.round((daysElapsed / totalDays) * 100) : 0 };
    }
  }

  return { schoolId, current, manualActive, effective, source, upcoming, previous, progress, warnings, allTerms: terms };
}
