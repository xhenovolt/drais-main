-- ============================================================================
-- DRCE — document_kind (Round 1 of universal-document consolidation).
--
-- Adds a Canva/Office-style "what is this?" classifier on every DRCE
-- template so the kitchen, the gallery, and the editor can show which
-- kind of document each template belongs to (Report · Certificate ·
-- ID Card · Transcript · Letter · Brochure · Custom · …whatever a
-- school later adds).
--
-- Key choices:
--   * VARCHAR(64), not ENUM — schools can introduce their own kinds
--     (`prefects_badge`, `tahfiz_certificate`, …) via the API without
--     a schema migration. Convention: lowercase snake_case.
--   * Default 'report' so every legacy row is auto-classified as the
--     reports they actually are; no manual backfill required.
--   * No render-time enforcement. The kind is metadata. The editor
--     shows it, the gallery groups by it, advisory warnings nudge
--     against unusual choices — but nothing blocks save or print.
--
-- A second small table holds starter templates the gallery offers:
--   drce_starters(id, name, document_kind, schema_json, school_id NULL,
--                 thumbnail_url, sort_order, is_active)
-- This is separate from dvcf_documents so the kitchen list and the
-- gallery list stay distinct: starters are seeds, not first-class docs.
--
-- Rollback:
--   ALTER TABLE dvcf_documents DROP COLUMN document_kind;
--   DROP TABLE drce_starters;
-- ============================================================================

ALTER TABLE dvcf_documents
  ADD COLUMN IF NOT EXISTS document_kind VARCHAR(64) NOT NULL DEFAULT 'report' AFTER template_category;

CREATE INDEX IF NOT EXISTS idx_dvcf_kind ON dvcf_documents (school_id, document_kind);

-- Starters — read-only-ish catalog the gallery offers. School-scoped rows
-- (school_id NOT NULL) come from "Save as starter" verb; global rows
-- (school_id NULL) are seeded by the application code below on first run
-- of the gallery API (idempotent INSERT ... ON DUPLICATE KEY UPDATE).
CREATE TABLE IF NOT EXISTS drce_starters (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  school_id       INT          NULL,                    -- NULL = built-in catalog
  document_kind   VARCHAR(64)  NOT NULL,
  name            VARCHAR(160) NOT NULL,
  description     VARCHAR(400) NULL,
  schema_json     LONGTEXT     NOT NULL,
  thumbnail_url   VARCHAR(500) NULL,
  sort_order      INT          NOT NULL DEFAULT 100,
  is_active       TINYINT(1)   NOT NULL DEFAULT 1,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by      BIGINT       NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_starter_scope (school_id, document_kind, name),
  KEY idx_kind_sort (document_kind, sort_order, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
