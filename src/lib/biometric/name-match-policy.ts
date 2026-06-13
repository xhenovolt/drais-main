/**
 * Phase 1E — deterministic name-match policy. PURE module (no DB, no
 * imports) so it is unit-testable and every caller applies exactly the
 * same rule.
 *
 * A device-supplied name may only create a PERMANENT PIN→person
 * mapping when the match is DETERMINISTIC:
 *
 *   - the top candidate is a full-score match (every name token
 *     matched — Jaccard 1.0), AND
 *   - no other candidate is even plausible.
 *
 * Two same-named people both score 1.0 → ambiguous, operator decides.
 * Anything weaker than full score → no auto-map (the old 0.6 threshold
 * mapped "close enough" names permanently; the forensic audit flagged
 * that as wrong-learner attribution risk).
 */

export interface ScoredCandidate {
  type: 'student' | 'staff';
  id: number;
  name: string;
  score: number;
}

export type NameMatchAction<C extends ScoredCandidate = ScoredCandidate> =
  | { action: 'map'; candidate: C }
  | { action: 'ambiguous'; candidates: C[] }
  | { action: 'no_match' };

/** A candidate must score at least this to be considered at all. */
export const DETERMINISTIC_MIN_SCORE = 0.999;
/** Any runner-up at or above this score makes the match ambiguous. */
export const AMBIGUITY_RUNNER_UP_SCORE = 0.5;

export function decideNameMatchAction<C extends ScoredCandidate>(
  candidates: C[],
): NameMatchAction<C> {
  if (!candidates || candidates.length === 0) return { action: 'no_match' };
  const sorted = [...candidates].sort((a, b) => b.score - a.score);
  const top = sorted[0];
  if (top.score < DETERMINISTIC_MIN_SCORE) {
    return { action: 'no_match' };
  }
  const plausibleOthers = sorted.slice(1).filter(c => c.score >= AMBIGUITY_RUNNER_UP_SCORE);
  if (plausibleOthers.length > 0) {
    return { action: 'ambiguous', candidates: [top, ...plausibleOthers] };
  }
  return { action: 'map', candidate: top };
}

/** Basic IPv4 detector — guards against the audited bug where the
 *  local TCP enroller stored device IPs in device_sn columns. */
export function looksLikeIpAddress(value: string | null | undefined): boolean {
  if (!value) return false;
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(String(value).trim());
}
