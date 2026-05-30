-- ============================================================================
-- Unified Ingestion Phase 1 — per-school learning memory
--
-- Stores the field mappings + device-user mappings + conflict-policy
-- choices the school has approved over time. The schema inference
-- engine consults this table FIRST so a school that consistently
-- exports admission numbers in a column called "Stamp No" gets
-- auto-recognised on future imports.
--
-- Additive, school-scoped, never read by the snapshot pipeline.
-- ============================================================================

-- ─── Field mapping memory (header → canonical field) ─────────────────────────
CREATE TABLE IF NOT EXISTS ingestion_field_memory (
  id                 BIGINT       NOT NULL AUTO_INCREMENT,
  school_id          BIGINT       NOT NULL,
  /** Which importer this mapping belongs to (e.g. 'students', 'results').
      A mapping learned for the students importer must not bleed into results. */
  pipeline_name      VARCHAR(64)  NOT NULL,
  /** Source header verbatim (case + spacing preserved). The inference
      engine also normalises on lookup so a school can rely on either form. */
  source_header      VARCHAR(255) NOT NULL,
  /** Canonical field name (matches CanonicalField.name in code). */
  canonical_field    VARCHAR(64)  NOT NULL,
  /** Who approved this mapping. NULL = inferred + auto-applied. */
  approved_by        BIGINT       NULL,
  approved_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  /** Last time this mapping was consulted — drives stale-mapping cleanup. */
  last_used_at       DATETIME     NULL,
  use_count          INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ingestion_field_memory (school_id, pipeline_name, source_header),
  KEY idx_ingestion_field_memory_pipeline (school_id, pipeline_name)
);

-- ─── Conflict policy memory (per-school + per-field overrides) ───────────────
CREATE TABLE IF NOT EXISTS ingestion_conflict_policy (
  id                 BIGINT       NOT NULL AUTO_INCREMENT,
  school_id          BIGINT       NOT NULL,
  pipeline_name      VARCHAR(64)  NOT NULL,
  /** NULL = the school's DEFAULT policy. Non-NULL = per-field override. */
  field              VARCHAR(64)  NULL,
  /** Policy enum — matches FieldConflictPolicy in code. */
  policy             ENUM(
                       'prefer-new', 'prefer-existing',
                       'prefer-higher', 'prefer-lower',
                       'prefer-non-empty', 'merge-average',
                       'fail-loud'
                     ) NOT NULL,
  set_by             BIGINT       NULL,
  set_at             DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ingestion_conflict_policy (school_id, pipeline_name, field),
  KEY idx_ingestion_conflict_policy_school (school_id)
);

-- ─── Per-run audit log (the full report from a single import run) ────────────
CREATE TABLE IF NOT EXISTS ingestion_runs (
  id                 BIGINT       NOT NULL AUTO_INCREMENT,
  /** UUID — matches IngestionReport.runId in code. */
  run_id             CHAR(36)     NOT NULL,
  school_id          BIGINT       NOT NULL,
  pipeline_name      VARCHAR(64)  NOT NULL,
  started_at         DATETIME     NOT NULL,
  finished_at        DATETIME     NOT NULL,
  /** JSON blob = full IngestionReport (schemaInference + outcomes + counts +
      errorSummary). Lets the review UI reconstruct any historical run. */
  report_json        LONGTEXT     NOT NULL,
  /** Convenience columns lifted from report_json for fast filtering. */
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
);

-- ─── Orphan queue (rows the pipeline couldn't auto-resolve) ──────────────────
CREATE TABLE IF NOT EXISTS ingestion_orphans (
  id                 BIGINT       NOT NULL AUTO_INCREMENT,
  school_id          BIGINT       NOT NULL,
  pipeline_name      VARCHAR(64)  NOT NULL,
  /** FK to ingestion_runs.run_id — every orphan is traceable to the run
      that produced it. */
  run_id             CHAR(36)     NOT NULL,
  /** Provenance — file/sheet/row number. */
  source_file        VARCHAR(255) NULL,
  source_sheet       VARCHAR(64)  NULL,
  source_row_index   INT          NULL,
  /** Why this row landed here. */
  reason             VARCHAR(500) NOT NULL,
  /** Identity candidates the resolver found, ranked. JSON array of
      { personId, confidence, reason } objects. */
  candidates_json    LONGTEXT     NULL,
  /** Original row payload, post-mapping. JSON object. */
  payload_json       LONGTEXT     NOT NULL,
  status             ENUM('pending','resolved','dismissed') NOT NULL DEFAULT 'pending',
  resolved_by        BIGINT       NULL,
  resolved_at        DATETIME     NULL,
  /** Free-form note the reviewer added at resolution time. */
  resolution_note    VARCHAR(500) NULL,
  created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ingestion_orphans_school_status (school_id, status, created_at),
  KEY idx_ingestion_orphans_run (run_id)
);

-- ─── Rollback ────────────────────────────────────────────────────────────────
-- DROP TABLE ingestion_orphans;
-- DROP TABLE ingestion_runs;
-- DROP TABLE ingestion_conflict_policy;
-- DROP TABLE ingestion_field_memory;
