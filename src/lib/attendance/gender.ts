/**
 * Gender-based attendance filtering (DRAIS Phase 5).
 *
 * people.gender is free-text with no server-side validation, and
 * production data already has mixed forms of the same value — confirmed
 * live: 'male' (2048 rows), 'Male' (482), 'M' (377), 'female' (2845),
 * 'Female' (1260), 'F' (155), plus NULL/'' for unspecified. An exact-match
 * filter (`gender = ?`) silently misses most of those variants — e.g.
 * filtering "Male" today only matches the 2048 lowercase rows and hides
 * the other 859 real students. This module normalizes at READ time only;
 * it never rewrites stored data (no inference, no silent backfill — the
 * spec is explicit about both), so it stays safe to ship without a data
 * migration and without risking miscategorizing a value nobody actually
 * entered.
 */

export type GenderFilter = 'male' | 'female';

const VARIANTS: Record<GenderFilter, string[]> = {
  male: ['male', 'm'],
  female: ['female', 'f'],
};

/**
 * A SQL boolean condition matching every known raw variant of `value` for
 * the given column reference (e.g. "p.gender"). Never matches NULL/blank —
 * a person with unspecified gender is excluded from either specific
 * filter, not silently bucketed into one.
 */
export function genderMatchSql(column: string, value: GenderFilter): { sql: string; params: string[] } {
  const variants = VARIANTS[value];
  return {
    sql: `LOWER(TRIM(${column})) IN (${variants.map(() => '?').join(',')})`,
    params: [...variants],
  };
}

/** The same condition for an arbitrary allow-list of filter values (e.g. a
 *  future multi-select), ORed together. */
export function genderMatchAnySql(column: string, values: GenderFilter[]): { sql: string; params: string[] } {
  const variants = values.flatMap((v) => VARIANTS[v]);
  if (variants.length === 0) return { sql: '1=0', params: [] };
  return {
    sql: `LOWER(TRIM(${column})) IN (${variants.map(() => '?').join(',')})`,
    params: variants,
  };
}

/**
 * JS-side normalizer for rows already fetched (detail reports, in-memory
 * aggregation). Never guesses — unrecognized, empty, or null input
 * normalizes to null ("unspecified"), never defaulted to a sex.
 */
export function normalizeGender(raw: string | null | undefined): GenderFilter | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase();
  if (v === 'male' || v === 'm') return 'male';
  if (v === 'female' || v === 'f') return 'female';
  return null;
}

export function isGenderFilter(value: unknown): value is GenderFilter {
  return value === 'male' || value === 'female';
}
