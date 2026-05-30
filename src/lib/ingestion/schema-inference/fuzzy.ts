/**
 * Fuzzy string scoring for header → canonical field matching.
 *
 * The inference engine layers three signals on top of each other:
 *   1. Exact normalized match  (confidence 1.00)
 *   2. Synonym list match      (confidence 0.95)
 *   3. Fuzzy score above 0.65  (confidence = the score)
 *
 * This file owns step 3. Two scoring functions are exposed — token-set
 * overlap and bounded Levenshtein ratio — and the consumer picks the
 * larger of the two. Token-set wins for word-order variations ("First
 * Name" vs "Name First"); Levenshtein wins for typos ("Admision Number").
 *
 * No external deps. Pure functions, fully tested.
 */

/** Normalise a header string: lowercase, strip punctuation, collapse whitespace. */
export function normalizeHeader(input: string): string {
  return input
    .toLowerCase()
    .replace(/[_\-./\\]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokenise a normalised string into words. */
export function tokenize(input: string): string[] {
  return normalizeHeader(input).split(' ').filter(Boolean);
}

/**
 * Token-set ratio — how much do the two token sets overlap?
 * Returns 0..1. Order-independent. ("First Name" vs "Name First" = 1.0)
 */
export function tokenSetScore(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersect = 0;
  for (const t of ta) if (tb.has(t)) intersect++;
  // Sørensen–Dice — symmetric, doesn't penalise size differences as harshly
  // as Jaccard. Important because user-typed headers tend to be longer than
  // canonical field names.
  return (2 * intersect) / (ta.size + tb.size);
}

/**
 * Bounded Levenshtein ratio. Returns 1 - (edits / maxLen). 0..1.
 * Uses Wagner–Fischer with O(min(a,b)) memory — fine for header-length
 * strings (rarely > 64 chars).
 */
export function levenshteinRatio(a: string, b: string): number {
  const na = normalizeHeader(a);
  const nb = normalizeHeader(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const m = na.length;
  const n = nb.length;
  // Ensure prev/curr length = shorter + 1
  const [s, t] = m < n ? [na, nb] : [nb, na];
  const sl = s.length;
  const tl = t.length;
  const prev = new Array<number>(sl + 1);
  const curr = new Array<number>(sl + 1);

  for (let i = 0; i <= sl; i++) prev[i] = i;

  for (let j = 1; j <= tl; j++) {
    curr[0] = j;
    for (let i = 1; i <= sl; i++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        curr[i - 1] + 1,     // insertion
        prev[i] + 1,         // deletion
        prev[i - 1] + cost,  // substitution
      );
    }
    for (let i = 0; i <= sl; i++) prev[i] = curr[i];
  }

  const distance = prev[sl];
  const maxLen = Math.max(sl, tl);
  return 1 - distance / maxLen;
}

/**
 * The score the inference engine actually uses: the larger of
 * token-set and Levenshtein. Either signal alone is too noisy.
 */
export function combinedScore(a: string, b: string): number {
  return Math.max(tokenSetScore(a, b), levenshteinRatio(a, b));
}
