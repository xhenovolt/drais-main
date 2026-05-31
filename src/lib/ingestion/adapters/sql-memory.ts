/**
 * SQL-backed MemoryReader / MemoryWriter — wires the unified ingestion
 * pipeline to the `ingestion_field_memory` table from
 * migrations/ingestion_memory.sql.
 *
 * Per-school per-pipeline header → canonical-field mapping. The schema
 * inference engine consults this BEFORE running fuzzy match, so a
 * school that consistently exports admission numbers in a column called
 * "Stamp No" gets auto-recognised on every future import without
 * manual review.
 *
 * Pure DB code. Same pattern as the PersonLookup adapter — keeps the
 * inference engine testable without DB by isolating SQL here.
 */

import { query } from '@/lib/db';
import type { MemoryReader, MemoryWriter } from '../memory';

export function createSqlMemoryReader(): MemoryReader {
  return {
    async loadFieldMemory(schoolId, pipelineName) {
      try {
        const rows = (await query(
          `SELECT source_header, canonical_field
             FROM ingestion_field_memory
            WHERE school_id     = ?
              AND pipeline_name = ?`,
          [schoolId, pipelineName],
        )) as Array<{ source_header: string; canonical_field: string }>;
        const out: Record<string, string> = {};
        for (const r of rows) out[r.source_header] = r.canonical_field;
        return out;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[sql-memory] loadFieldMemory failed:', err);
        return {};
      }
    },
  };
}

export function createSqlMemoryWriter(): MemoryWriter {
  return {
    async rememberFieldMapping(args) {
      await query(
        `INSERT INTO ingestion_field_memory
           (school_id, pipeline_name, source_header, canonical_field, approved_by, last_used_at, use_count)
         VALUES (?, ?, ?, ?, ?, NOW(), 1)
         ON DUPLICATE KEY UPDATE
           canonical_field = VALUES(canonical_field),
           approved_by     = COALESCE(VALUES(approved_by), approved_by),
           last_used_at    = NOW(),
           use_count       = use_count + 1`,
        [args.schoolId, args.pipelineName, args.sourceHeader, args.canonicalField, args.approvedBy],
      );
    },

    async forgetFieldMapping(args) {
      await query(
        `DELETE FROM ingestion_field_memory
          WHERE school_id     = ?
            AND pipeline_name = ?
            AND source_header = ?`,
        [args.schoolId, args.pipelineName, args.sourceHeader],
      );
    },

    async touchFieldMapping(args) {
      await query(
        `UPDATE ingestion_field_memory
            SET last_used_at = NOW(),
                use_count    = use_count + 1
          WHERE school_id     = ?
            AND pipeline_name = ?
            AND source_header = ?`,
        [args.schoolId, args.pipelineName, args.sourceHeader],
      );
    },
  };
}

/**
 * Persist a full IngestionReport to ingestion_runs. Called by the
 * v2 route after every pipeline run for forensic recovery + admin UI.
 */
export async function persistIngestionRun(args: {
  schoolId:    number;
  pipelineName: string;
  runId:       string;
  startedAt:   string;
  finishedAt:  string;
  reportJson:  string;
  counts: {
    parsed: number; inserted: number; updated: number; merged: number;
    skipped: number; orphaned: number; failed: number;
  };
  initiatedBy: number | null;
}): Promise<void> {
  await query(
    `INSERT INTO ingestion_runs
       (run_id, school_id, pipeline_name, started_at, finished_at, report_json,
        parsed_count, inserted_count, updated_count, merged_count,
        skipped_count, orphaned_count, failed_count, initiated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      args.runId, args.schoolId, args.pipelineName,
      args.startedAt, args.finishedAt, args.reportJson,
      args.counts.parsed, args.counts.inserted, args.counts.updated, args.counts.merged,
      args.counts.skipped, args.counts.orphaned, args.counts.failed, args.initiatedBy,
    ],
  );
}

/**
 * Persist an unresolved row to the orphan queue for human review.
 */
export async function persistOrphan(args: {
  schoolId:        number;
  pipelineName:    string;
  runId:           string;
  sourceFile:      string | null;
  sourceSheet:     string | null;
  sourceRowIndex:  number | null;
  reason:          string;
  candidatesJson:  string | null;
  payloadJson:     string;
}): Promise<void> {
  await query(
    `INSERT INTO ingestion_orphans
       (school_id, pipeline_name, run_id,
        source_file, source_sheet, source_row_index,
        reason, candidates_json, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      args.schoolId, args.pipelineName, args.runId,
      args.sourceFile, args.sourceSheet, args.sourceRowIndex,
      args.reason, args.candidatesJson, args.payloadJson,
    ],
  );
}
