-- ============================================================================
-- Phase 2 — Template Category Architecture
--
-- Adds an explicit `template_category` column to dvcf_documents so every
-- template (DB-backed or built-in) has a deterministic classification.
-- This replaces every name-based detection heuristic at runtime; the column
-- becomes the single source of truth.
--
-- Categories:
--   standard    — generic catalog template
--   emergency   — lightweight, fast-render emergency template
--   legacy_rpt  — pre-DRCE rpt.html-derived template
--   drce        — authored in the DRCE editor (default for shared catalog)
--   arabic      — Arabic-numeral / RTL template
--   custom      — school-authored variant
--
-- TiDB compatibility:
--   * dvcf_documents has no generated columns depending on existing fields,
--     so a straight ADD COLUMN is supported.
--   * NOT NULL DEFAULT 'drce' so the row count is unchanged and pre-existing
--     SELECTs continue to work.
--   * Backfill is non-destructive: every UPDATE leaves the row otherwise
--     untouched and the WHERE template_category = 'drce' guard keeps the
--     migration idempotent if it runs twice.
--
-- Rollback:
--   ALTER TABLE dvcf_documents DROP INDEX idx_dvcf_template_category;
--   ALTER TABLE dvcf_documents DROP COLUMN template_category;
-- ============================================================================

ALTER TABLE dvcf_documents
  ADD COLUMN template_category
    ENUM('standard','emergency','legacy_rpt','drce','arabic','custom')
    NOT NULL DEFAULT 'drce'
    AFTER template_key;

-- One-time backfill. Forward-going writes set template_category explicitly,
-- so name heuristics are tolerated here for legacy classification only.
UPDATE dvcf_documents
   SET template_category = CASE
     WHEN LOWER(template_key) IN ('legacy_rpt','rpt_html')
       THEN 'legacy_rpt'
     WHEN LOWER(name) LIKE '%emergency%' OR LOWER(template_key) LIKE '%emergency%'
       THEN 'emergency'
     WHEN LOWER(name) LIKE '%arabic%' OR LOWER(template_key) LIKE '%arabic%'
       THEN 'arabic'
     WHEN school_id IS NOT NULL
       THEN 'custom'
     ELSE 'drce'
   END
 WHERE template_category = 'drce';

-- Index supports the registry endpoint's (document_type, category) filter
-- and the dashboard's per-category counts without a full scan.
CREATE INDEX idx_dvcf_template_category
  ON dvcf_documents (template_category, document_type);
