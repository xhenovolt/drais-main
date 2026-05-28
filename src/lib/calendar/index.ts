/**
 * Academic calendar inference — shared service.
 *
 * Pure inference over `terms` + `academic_years`. Consumed by DRCE's
 * computed-field registry (Phase A+B), and intended to be the single source
 * of truth for the rest of DRAIS too (deadlines, admissions, fee schedules).
 *
 * Functions are deterministic given the database rows they read. They never
 * write. They never invoke render. They never call `Date.now()` for logic
 * decisions — callers pass any "now" they need.
 *
 * Tenant safety: every query is school-scoped via the schoolId arg. There is
 * no other tenant boundary in this file.
 */
import { query } from '@/lib/db';

export interface TermRow {
  id:                number;
  school_id:         number;
  academic_year_id:  number;
  name:              string;
  start_date:        string | null;     // ISO YYYY-MM-DD
  end_date:          string | null;
}

export interface AcademicYearRow {
  id:          number;
  school_id:   number;
  name:        string;
  start_date:  string | null;
  end_date:    string | null;
}

export interface CalendarInference {
  current_term:        TermRow | null;
  next_term:           TermRow | null;
  prev_term:           TermRow | null;
  current_year:        AcademicYearRow | null;
  next_term_starts_at: string | null;    // ISO date — start of next_term, if known
  this_term_ends_at:   string | null;
  year_rollover:       boolean;          // true when next_term is in a different year
}

// ──────────────────────────────────────────────────────────────────────────
// Low-level fetchers (school-scoped, read-only)
// ──────────────────────────────────────────────────────────────────────────

async function fetchYearTerms(schoolId: number, academicYearId: number): Promise<TermRow[]> {
  const rows = (await query(
    `SELECT id, school_id, academic_year_id, name, start_date, end_date
       FROM terms
      WHERE school_id = ? AND academic_year_id = ?
      ORDER BY COALESCE(start_date, '9999-12-31') ASC, id ASC`,
    [schoolId, academicYearId],
  )) as TermRow[];
  return rows;
}

async function fetchSchoolYears(schoolId: number): Promise<AcademicYearRow[]> {
  return (await query(
    `SELECT id, school_id, name, start_date, end_date
       FROM academic_years
      WHERE school_id = ?
      ORDER BY COALESCE(start_date, '9999-12-31') ASC, id ASC`,
    [schoolId],
  )) as AcademicYearRow[];
}

async function fetchTerm(schoolId: number, termId: number): Promise<TermRow | null> {
  const rows = (await query(
    `SELECT id, school_id, academic_year_id, name, start_date, end_date
       FROM terms WHERE school_id = ? AND id = ? LIMIT 1`,
    [schoolId, termId],
  )) as TermRow[];
  return rows[0] ?? null;
}

async function fetchYear(schoolId: number, yearId: number): Promise<AcademicYearRow | null> {
  const rows = (await query(
    `SELECT id, school_id, name, start_date, end_date
       FROM academic_years WHERE school_id = ? AND id = ? LIMIT 1`,
    [schoolId, yearId],
  )) as AcademicYearRow[];
  return rows[0] ?? null;
}

// ──────────────────────────────────────────────────────────────────────────
// Public inference
// ──────────────────────────────────────────────────────────────────────────

/**
 * The term immediately after `termId`. If `termId` is the last term of its
 * year, returns the first term of the next academic year (year rollover).
 * Returns null only when there is no later term anywhere in the school.
 */
export async function nextTerm(schoolId: number, termId: number): Promise<TermRow | null> {
  const term = await fetchTerm(schoolId, termId);
  if (!term) return null;

  const yearTerms = await fetchYearTerms(schoolId, term.academic_year_id);
  const idx = yearTerms.findIndex(t => t.id === term.id);
  if (idx >= 0 && idx < yearTerms.length - 1) return yearTerms[idx + 1];

  // Rollover — find the next academic year and its first term
  const years = await fetchSchoolYears(schoolId);
  const yi = years.findIndex(y => y.id === term.academic_year_id);
  if (yi < 0 || yi === years.length - 1) return null;
  const nextYear = years[yi + 1];
  const nextYearTerms = await fetchYearTerms(schoolId, nextYear.id);
  return nextYearTerms[0] ?? null;
}

/** Previous term, including reverse year-rollover. */
export async function prevTerm(schoolId: number, termId: number): Promise<TermRow | null> {
  const term = await fetchTerm(schoolId, termId);
  if (!term) return null;

  const yearTerms = await fetchYearTerms(schoolId, term.academic_year_id);
  const idx = yearTerms.findIndex(t => t.id === term.id);
  if (idx > 0) return yearTerms[idx - 1];

  const years = await fetchSchoolYears(schoolId);
  const yi = years.findIndex(y => y.id === term.academic_year_id);
  if (yi <= 0) return null;
  const prevYear = years[yi - 1];
  const prevYearTerms = await fetchYearTerms(schoolId, prevYear.id);
  return prevYearTerms[prevYearTerms.length - 1] ?? null;
}

/** Authoritative bundle for a snapshot or preview. */
export async function infer(schoolId: number, currentTermId: number): Promise<CalendarInference> {
  const current = await fetchTerm(schoolId, currentTermId);
  if (!current) {
    return {
      current_term: null, next_term: null, prev_term: null, current_year: null,
      next_term_starts_at: null, this_term_ends_at: null, year_rollover: false,
    };
  }
  const [year, nxt, prv] = await Promise.all([
    fetchYear(schoolId, current.academic_year_id),
    nextTerm(schoolId, current.id),
    prevTerm(schoolId, current.id),
  ]);
  return {
    current_term:        current,
    next_term:           nxt,
    prev_term:           prv,
    current_year:        year,
    next_term_starts_at: nxt?.start_date ?? null,
    this_term_ends_at:   current.end_date ?? null,
    year_rollover:       !!(nxt && nxt.academic_year_id !== current.academic_year_id),
  };
}
