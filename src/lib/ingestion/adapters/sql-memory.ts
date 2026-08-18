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

/**
 * Lazy, idempotent schema bootstrap — same CREATE TABLE IF NOT EXISTS
 * pattern used everywhere else in DRAIS (ensureSentinelSchema,
 * ensureNotificationSchema, etc). Added after discovering LIVE
 * (readiness-audit import redesign, Phase D) that migrations/
 * ingestion_memory.sql had never actually been applied to production —
 * these 4 tables genuinely did not exist until this fix, meaning every
 * persistIngestionRun/persistOrphan call before it was silently failing
 * (caught by the v2 routes' own warnings array, but still — the audit
 * trail this whole system exists to provide was never being written).
 * This ensures a fresh environment (or one where the manual migration
 * was skipped, like this one was) can never end up in that state again.
 */
let ensured: Promise<void> | null = null;
export async function ensureIngestionSchema(): Promise<void> {
  if (!ensured) {
    ensured = (async () => {
      await query(`
        CREATE TABLE IF NOT EXISTS ingestion_field_memory (
          id                 BIGINT       NOT NULL AUTO_INCREMENT,
          school_id          BIGINT       NOT NULL,
          pipeline_name      VARCHAR(64)  NOT NULL,
          source_header      VARCHAR(255) NOT NULL,
          canonical_field    VARCHAR(64)  NOT NULL,
          approved_by        BIGINT       NULL,
          approved_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          last_used_at       DATETIME     NULL,
          use_count          INT          NOT NULL DEFAULT 0,
          PRIMARY KEY (id),
          UNIQUE KEY uk_ingestion_field_memory (school_id, pipeline_name, source_header),
          KEY idx_ingestion_field_memory_pipeline (school_id, pipeline_name)
        )
      `).catch(() => {});
      await query(`
        CREATE TABLE IF NOT EXISTS ingestion_conflict_policy (
          id                 BIGINT       NOT NULL AUTO_INCREMENT,
          school_id          BIGINT       NOT NULL,
          pipeline_name      VARCHAR(64)  NOT NULL,
          field              VARCHAR(64)  NULL,
          policy             ENUM('prefer-new', 'prefer-existing', 'prefer-higher', 'prefer-lower', 'prefer-non-empty', 'merge-average', 'fail-loud') NOT NULL,
          set_by             BIGINT       NULL,
          set_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uk_ingestion_conflict_policy (school_id, pipeline_name, field),
          KEY idx_ingestion_conflict_policy_school (school_id)
        )
      `).catch(() => {});
      await query(`
        CREATE TABLE IF NOT EXISTS ingestion_runs (
          id                 BIGINT       NOT NULL AUTO_INCREMENT,
          run_id             CHAR(36)     NOT NULL,
          school_id          BIGINT       NOT NULL,
          pipeline_name      VARCHAR(64)  NOT NULL,
          started_at         DATETIME     NOT NULL,
          finished_at        DATETIME     NOT NULL,
          report_json        LONGTEXT     NOT NULL,
          parsed_count       INT          NOT NULL DEFAULT 0,
          inserted_count     INT          NOT NULL DEFAULT 0,
          updated_count      INT          NOT NULL DEFAULT 0,
          merged_count       INT          NOT NULL DEFAULT 0,
          skipped_count      INT          NOT NULL DEFAULT 0,
          orphaned_count     INT          NOT NULL DEFAULT 0,
          failed_count       INT          NOT NULL DEFAULT 0,
          initiated_by       BIGINT       NULL,
          PRIMARY KEY (id),
          UNIQUE KEY uk_ingestion_runs_run_id (run_id),
          KEY idx_ingestion_runs_school_pipe (school_id, pipeline_name, started_at)
        )
      `).catch(() => {});
      await query(`
        CREATE TABLE IF NOT EXISTS ingestion_orphans (
          id                 BIGINT       NOT NULL AUTO_INCREMENT,
          school_id          BIGINT       NOT NULL,
          pipeline_name      VARCHAR(64)  NOT NULL,
          run_id             CHAR(36)     NOT NULL,
          source_file        VARCHAR(255) NULL,
          source_sheet       VARCHAR(64)  NULL,
          source_row_index   INT          NULL,
          reason             VARCHAR(500) NOT NULL,
          candidates_json    LONGTEXT     NULL,
          payload_json       LONGTEXT     NOT NULL,
          status             ENUM('pending','resolved','dismissed') NOT NULL DEFAULT 'pending',
          resolved_by        BIGINT       NULL,
          resolved_at        DATETIME     NULL,
          resolution_note    VARCHAR(500) NULL,
          created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          KEY idx_ingestion_orphans_school_status (school_id, status, created_at),
          KEY idx_ingestion_orphans_run (run_id)
        )
      `).catch(() => {});
    })();
  }
  return ensured;
}

export function createSqlMemoryReader(): MemoryReader {
  return {
    async loadFieldMemory(schoolId, pipelineName) {
      try {
        await ensureIngestionSchema();
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
      await ensureIngestionSchema();
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
  await ensureIngestionSchema();
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
  await ensureIngestionSchema();
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
