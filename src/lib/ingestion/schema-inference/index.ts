/**
 * Schema inference engine — given a header set + a canonical-field catalog,
 * produce a per-header mapping with confidence scores.
 *
 * Resolution order per source header (highest wins):
 *   1. MEMORY — if the school has previously mapped this exact header to a
 *      canonical field, use that. Confidence 1.0. Reason: 'memory'.
 *   2. EXACT — normalised string equality with the canonical field name.
 *      Confidence 1.0. Reason: 'exact'.
 *   3. NORMALIZED — normalised equality with the canonical field label.
 *      Confidence 0.95. Reason: 'normalized'.
 *   4. SYNONYM — normalised equality with any string in the field's
 *      `synonyms`. Confidence 0.95. Reason: 'synonym'.
 *   5. FUZZY — combinedScore against (name | label | each synonym).
 *      Confidence = best score IF >= 0.65. Reason: 'fuzzy'.
 *   6. NONE — leave canonicalField = null, confidence = 0,
 *      reason = 'unmapped'.
 *
 * The "memory" path keys are per-school: a school that consistently
 * exports admission numbers in a column called "Stamp No" trains the
 * inference engine so future imports auto-recognise that header without
 * manual review. Memory is stored by the caller (Phase 1.7 — see
 * ../memory/index.ts).
 *
 * The engine does NOT mutate inputs and does NOT throw. Bad inputs
 * (empty headers, duplicate headers, weird unicode) produce sensible
 * SchemaInferenceResult outputs that the review UI can surface.
 */

import type {
  CanonicalField,
  FieldMapping,
  SchemaInferenceResult,
} from '../types';
import { combinedScore, normalizeHeader } from './fuzzy';

export interface InferenceOptions {
  /** Per-school memory of past mappings. Map from raw source header → canonical
   *  field name. Highest priority signal when present. */
  memory?: Record<string, string>;
  /** Threshold below which a fuzzy match is treated as no match. Default 0.65
   *  — empirically the boundary where token-set + Levenshtein together stop
   *  producing noise. Schools that want stricter behaviour can raise this. */
  fuzzyThreshold?: number;
  /** When a header has multiple candidate canonical fields scoring above the
   *  threshold, this is how much higher the winner must score to be auto-
   *  selected vs surfaced as ambiguous. Default 0.05. */
  ambiguityMargin?: number;
}

/**
 * Lower-cased prefix that strongly suggests a canonical field. Lets us
 * boost confidence for "common" prefixes like "student_no" vs the
 * confused "no" alone. Currently optional. */
const SYNONYM_NORM = (s: string) => normalizeHeader(s);

export function inferSchema(
  sourceHeaders: string[],
  fields: CanonicalField[],
  options: InferenceOptions = {},
): SchemaInferenceResult {
  const memory = options.memory ?? {};
  const threshold = options.fuzzyThreshold ?? 0.65;
  const ambiguityMargin = options.ambiguityMargin ?? 0.05;

  const mappings: FieldMapping[] = sourceHeaders.map((rawHeader) => {
    const header = rawHeader.trim();
    if (!header) {
      return {
        sourceHeader: rawHeader,
        canonicalField: null,
        confidence: 0,
        reason: 'unmapped',
      };
    }

    // 1. Memory hit — by raw header AND by normalised header. Memory
    //    wins as long as the field still exists in the catalog.
    const memTarget = memory[header] ?? memory[normalizeHeader(header)];
    if (memTarget && fields.some(f => f.name === memTarget)) {
      return {
        sourceHeader: rawHeader,
        canonicalField: memTarget,
        confidence: 1,
        reason: 'memory',
      };
    }

    const normHeader = normalizeHeader(header);

    // 2/3/4. Exact / normalized / synonym match against any field.
    for (const f of fields) {
      if (normalizeHeader(f.name) === normHeader) {
        return {
          sourceHeader: rawHeader,
          canonicalField: f.name,
          confidence: 1,
          reason: 'exact',
        };
      }
    }
    for (const f of fields) {
      if (normalizeHeader(f.label) === normHeader) {
        return {
          sourceHeader: rawHeader,
          canonicalField: f.name,
          confidence: 0.95,
          reason: 'normalized',
        };
      }
    }
    for (const f of fields) {
      if (f.synonyms.some(s => SYNONYM_NORM(s) === normHeader)) {
        return {
          sourceHeader: rawHeader,
          canonicalField: f.name,
          confidence: 0.95,
          reason: 'synonym',
        };
      }
    }

    // 5. Fuzzy — score against name, label, and every synonym.
    let best: { field: string; score: number } | null = null;
    let second: { field: string; score: number } | null = null;
    for (const f of fields) {
      const candidateStrings = [f.name, f.label, ...f.synonyms];
      let fieldBest = 0;
      for (const cand of candidateStrings) {
        const s = combinedScore(header, cand);
        if (s > fieldBest) fieldBest = s;
      }
      if (fieldBest >= threshold) {
        if (!best || fieldBest > best.score) {
          second = best;
          best = { field: f.name, score: fieldBest };
        } else if (!second || fieldBest > second.score) {
          second = { field: f.name, score: fieldBest };
        }
      }
    }

    if (best) {
      // Ambiguity guard — if the second-best is within the margin, treat
      // it as unmapped so the review UI MUST surface it. Auto-applying
      // a coin-flip would silently corrupt data.
      if (second && best.score - second.score < ambiguityMargin) {
        return {
          sourceHeader: rawHeader,
          canonicalField: null,
          confidence: best.score,
          reason: 'unmapped',
        };
      }
      return {
        sourceHeader: rawHeader,
        canonicalField: best.field,
        confidence: Math.round(best.score * 100) / 100,
        reason: 'fuzzy',
      };
    }

    return {
      sourceHeader: rawHeader,
      canonicalField: null,
      confidence: 0,
      reason: 'unmapped',
    };
  });

  // Required-field check — which required canonical fields have NO mapping?
  const mappedTargets = new Set(
    mappings.filter(m => m.canonicalField).map(m => m.canonicalField as string),
  );
  const unresolvedRequired = fields
    .filter(f => f.required && !mappedTargets.has(f.name))
    .map(f => f.name);

  // Overall confidence = lowest confidence among MAPPED required fields.
  // If a required field is unresolved, overall confidence is 0 and the
  // pipeline blocks.
  let overallConfidence = 1;
  if (unresolvedRequired.length > 0) {
    overallConfidence = 0;
  } else {
    for (const f of fields.filter(x => x.required)) {
      const m = mappings.find(mm => mm.canonicalField === f.name);
      if (m && m.confidence < overallConfidence) overallConfidence = m.confidence;
    }
  }

  return {
    mappings,
    unresolvedRequired,
    overallConfidence,
  };
}

/**
 * Apply the inferred mapping to a raw row, producing a Record keyed by
 * canonical field names. Unmapped source columns are dropped — the
 * caller can preserve them in `__raw` if needed for forensic recovery.
 */
export function applyMapping(
  row: Record<string, unknown>,
  mappings: FieldMapping[],
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of mappings) {
    if (m.canonicalField && row[m.sourceHeader] !== undefined) {
      out[m.canonicalField] = row[m.sourceHeader];
    }
  }
  return out;
}

export * from './fuzzy';
