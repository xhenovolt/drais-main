/**
 * Sheet-purpose guessing — "does this sheet look like students, fees, or
 * results?" — deterministic, no I/O, no DB.
 *
 * Reuses the SAME schema-inference engine (inferSchema) already proven for
 * column mapping, rather than a parallel heuristic: run the sheet's headers
 * against each known canonical-field catalog and see which one the real
 * mapper would resolve the most REQUIRED fields against. This means the
 * purpose guess and the eventual column mapping can never disagree with
 * each other — they're the same engine asked the same question twice.
 *
 * Phase C: fees now has a real CanonicalField catalog (FEE_FIELDS in
 * pipelines/fees-schema.ts) — used here directly, the same way
 * STUDENT_FIELDS/RESULT_FIELDS already are, so purpose-guessing and
 * actual column mapping can never disagree with each other.
 */
import { inferSchema } from '../schema-inference';
import { STUDENT_FIELDS } from '../pipelines/students-schema';
import { RESULT_FIELDS } from '../pipelines/results-schema';
import { FEE_FIELDS } from '../pipelines/fees-schema';
import type { CanonicalField } from '../types';

export type SheetPurpose = 'students' | 'fees' | 'results' | 'unknown';

export interface PurposeGuess {
  purpose: SheetPurpose;
  confidence: number; // 0..1
  reason: string;
  /** Score per candidate purpose, for the review UI to show "also considered". */
  scores: Record<Exclude<SheetPurpose, 'unknown'>, number>;
}

function scoreAgainst(headers: string[], fields: CanonicalField[]): number {
  if (headers.length === 0) return 0;
  const result = inferSchema(headers, fields);
  const mappedCount = result.mappings.filter((m) => m.canonicalField !== null).length;
  // Reward both breadth (how many headers mapped) and confidence.
  return (mappedCount / headers.length) * result.overallConfidence * (mappedCount > 0 ? 1 : 0)
    || (mappedCount / Math.max(1, headers.length)) * 0.5; // fallback if overallConfidence came back 0 despite some mappings
}

export function guessSheetPurpose(headers: string[]): PurposeGuess {
  const cleaned = headers.filter((h) => h && h.trim() !== '');
  const scores = {
    students: scoreAgainst(cleaned, STUDENT_FIELDS),
    fees: scoreAgainst(cleaned, FEE_FIELDS),
    results: scoreAgainst(cleaned, RESULT_FIELDS),
  };

  const entries = Object.entries(scores) as Array<[Exclude<SheetPurpose, 'unknown'>, number]>;
  entries.sort((a, b) => b[1] - a[1]);
  const [topPurpose, topScore] = entries[0];
  const [, secondScore] = entries[1];

  // Require both a minimum absolute score AND a clear margin over the
  // runner-up — same "don't guess when it's close" philosophy as the
  // schema-inference ambiguityMargin.
  if (topScore < 0.25 || topScore - secondScore < 0.1) {
    return {
      purpose: 'unknown',
      confidence: 0,
      reason: topScore < 0.25
        ? 'headers do not resemble any known dataset (students/fees/results) closely enough to guess'
        : `too close to call between ${entries[0][0]} (${(topScore * 100).toFixed(0)}%) and ${entries[1][0]} (${(secondScore * 100).toFixed(0)}%)`,
      scores,
    };
  }

  return {
    purpose: topPurpose,
    confidence: Math.min(1, topScore),
    reason: `${(topScore * 100).toFixed(0)}% of headers resolve against the ${topPurpose} field catalog`,
    scores,
  };
}
