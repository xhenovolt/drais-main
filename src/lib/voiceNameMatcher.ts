/**
 * voiceNameMatcher.ts
 * Fuzzy name matching for the Voice-Admission module.
 *
 * Algorithm:
 *  1. Normalise both strings using Luganda phonetic rules
 *     (vowel sounds: a→ah, e→eh, i→ee, o→oh, u→oo)
 *  2. Compute Levenshtein distance on the normalised forms
 *  3. Convert distance to a confidence score (0–100)
 *  4. Return top-N matches sorted by confidence descending
 */

import nameBank from '@/data/nameBank.json';

export interface NameEntry {
  name: string;
  phonetic_hint: string;
  origin: 'local' | 'islamic' | 'christian';
  gender_bias: 'male' | 'female' | 'unisex';
}

export interface NameMatch extends NameEntry {
  confidence: number; // 0–100
}

// ─── Phonetic normalisation ────────────────────────────────────────────────
function normalise(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    // collapse common browser speech mis-hearings
    .replace(/ck/g, 'k')
    .replace(/ph/g, 'f')
    .replace(/wh/g, 'w')
    .replace(/qu/g, 'kw')
    // Luganda digraphs → placeholders so vowel replacement doesn't break them
    .replace(/ny/g, 'ñ')
    .replace(/ng'/g, 'ŋ')
    .replace(/mw/g, 'µ')
    .replace(/lw/g, 'λ')
    // vowel substitution (Luganda phonetic equivalence)
    .replace(/a/g, 'ah')
    .replace(/e/g, 'eh')
    .replace(/i/g, 'ee')
    .replace(/o/g, 'oh')
    .replace(/u/g, 'oo')
    // collapse double consonants (Luganda gemination treated as one)
    .replace(/(.)\1+/g, '$1')
    // strip non-alpha (hyphens, apostrophes, spaces)
    .replace(/[^a-záéíóúàèìòùñŋµλ]/g, '');
}

// ─── Levenshtein distance (iterative, space-optimised) ───────────────────────
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  const curr = new Array<number>(b.length + 1);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,       // insertion
        prev[j] + 1,           // deletion
        prev[j - 1] + cost,    // substitution
      );
    }
    prev.splice(0, prev.length, ...curr);
  }
  return prev[b.length];
}

// ─── Confidence score ─────────────────────────────────────────────────────────
function confidence(dist: number, maxLen: number): number {
  if (maxLen === 0) return 100;
  return Math.max(0, Math.round((1 - dist / maxLen) * 100));
}

// ─── Pre-normalise the bank once at module load ──────────────────────────────
const bank = (nameBank as NameEntry[]).map(entry => ({
  ...entry,
  _norm: normalise(entry.name),
}));

// ─── Public API ──────────────────────────────────────────────────────────────
/**
 * Find the best matching names for a raw voice-capture string.
 *
 * @param input - Raw string from Web Speech API (e.g. "na cooda")
 * @param topN  - Number of results to return (default 3)
 * @returns Array of NameMatch objects sorted by confidence descending
 */
export function findClosestName(input: string, topN = 3): NameMatch[] {
  const normInput = normalise(input);
  if (!normInput) return [];

  const scored = bank.map(entry => {
    const dist = levenshtein(normInput, entry._norm);
    const maxLen = Math.max(normInput.length, entry._norm.length);
    return {
      name: entry.name,
      phonetic_hint: entry.phonetic_hint,
      origin: entry.origin,
      gender_bias: entry.gender_bias,
      confidence: confidence(dist, maxLen),
    } satisfies NameMatch;
  });

  scored.sort((a, b) => b.confidence - a.confidence);
  return scored.slice(0, topN);
}
