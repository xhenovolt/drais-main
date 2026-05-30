/**
 * Import memory — DB-backed adapter that the pipeline reads BEFORE
 * inference and writes to AFTER a run completes (or after a human
 * confirms a mapping in the review UI).
 *
 * The schema inference engine doesn't depend on this module — it
 * accepts a plain { sourceHeader → canonicalField } map. This module
 * just supplies that map from the DB and persists updates.
 *
 * Same testability rule as the identity resolver: this file owns the
 * SHAPE (LoadMemory / SaveMemory interfaces); the actual SQL lives in
 * the route adapter. Phase 1 doesn't wire any route — that's Phase 2.
 */

import type { FieldMapping } from '../types';

export interface MemoryReader {
  /** Get { sourceHeader → canonicalField } for (school, pipeline).
   *  Returns {} when no entries exist. */
  loadFieldMemory(
    schoolId: number,
    pipelineName: string,
  ): Promise<Record<string, string>>;
}

export interface MemoryWriter {
  /** Persist a mapping that the school just approved (auto-inferred and
   *  high-confidence, OR human-confirmed in the review UI). Existing
   *  entries for the same source_header are overwritten. */
  rememberFieldMapping(args: {
    schoolId: number;
    pipelineName: string;
    sourceHeader: string;
    canonicalField: string;
    approvedBy: number | null;
  }): Promise<void>;

  /** Forget a mapping — when the school explicitly says "the header X
   *  should NOT map to field Y any more". */
  forgetFieldMapping(args: {
    schoolId: number;
    pipelineName: string;
    sourceHeader: string;
  }): Promise<void>;

  /** Bump last_used_at + use_count for an existing mapping. Called
   *  every time the inference engine actually USES a memory hit (vs
   *  just having one available). Drives stale-mapping cleanup later. */
  touchFieldMapping(args: {
    schoolId: number;
    pipelineName: string;
    sourceHeader: string;
  }): Promise<void>;
}

/**
 * Decide which inferred mappings are worth remembering automatically
 * — high-confidence non-fuzzy mappings, basically. The review UI can
 * still let humans approve fuzzy / unmapped fields and call
 * rememberFieldMapping directly.
 */
export function autoRememberableMappings(mappings: FieldMapping[]): FieldMapping[] {
  return mappings.filter(
    m =>
      m.canonicalField != null
      && m.confidence >= 0.95
      && m.reason !== 'fuzzy' // fuzzy hits require human approval before becoming memory
      && m.reason !== 'memory', // don't re-write what we just read
  );
}

/**
 * Convenience: persist all auto-rememberable mappings from a fresh
 * inference run in one batch. The caller already has the schoolId +
 * pipelineName context; we just iterate.
 */
export async function persistAutoMappings(args: {
  schoolId: number;
  pipelineName: string;
  mappings: FieldMapping[];
  writer: MemoryWriter;
  approvedBy: number | null;
}): Promise<void> {
  const candidates = autoRememberableMappings(args.mappings);
  for (const m of candidates) {
    await args.writer.rememberFieldMapping({
      schoolId: args.schoolId,
      pipelineName: args.pipelineName,
      sourceHeader: m.sourceHeader,
      canonicalField: m.canonicalField as string,
      approvedBy: args.approvedBy,
    });
  }
}
