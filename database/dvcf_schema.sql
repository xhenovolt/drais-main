-- ============================================================================
-- database/dvcf_schema.sql
-- DRCE (DRAIS Report Composition Engine) — Phase A DB migration
-- Run this once against TiDB Cloud after backing up the existing database.
-- Safe to run multiple times (uses CREATE TABLE IF NOT EXISTS, etc.).
-- ============================================================================

-- dvcf_documents: stores serialised DRCEDocument JSON
CREATE TABLE IF NOT EXISTS dvcf_documents (
  id              INT          NOT NULL AUTO_INCREMENT AUTO_ID_CACHE 1,
  school_id       INT          NULL     DEFAULT NULL COMMENT 'NULL = global template, set = school-specific',
  document_type   ENUM('report_card', 'id_card', 'transcript')
                               NOT NULL DEFAULT 'report_card',
  name            VARCHAR(100) NOT NULL,
  description     VARCHAR(255) NOT NULL DEFAULT '',
  schema_json     LONGTEXT     NOT NULL COMMENT 'DRCEDocument JSON — $schema: drce/v1',
  schema_version  INT          NOT NULL DEFAULT 1,
  is_default      TINYINT(1)   NOT NULL DEFAULT 0,
  template_key    VARCHAR(50)  NULL     DEFAULT NULL COMMENT 'stable slug for code look-up',
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_school_type  (school_id, document_type),
  KEY idx_template_key (template_key),
  KEY idx_is_default   (is_default)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- dvcf_active_documents: per-school active document per type
-- (replaces school_settings 'active_report_template_id' for the new engine)
CREATE TABLE IF NOT EXISTS dvcf_active_documents (
  school_id     INT  NOT NULL,
  document_type ENUM('report_card', 'id_card', 'transcript') NOT NULL DEFAULT 'report_card',
  document_id   INT  NOT NULL,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (school_id, document_type),
  KEY idx_document_id (document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ────────────────────────────────────────────────────────────────────────────
-- Seed global built-in templates (ids 1–3 are reserved for system defaults)
-- On conflict (re-run), update name/description only — preserve schema_json
-- so schools cannot accidentally lose a customised global.
-- ────────────────────────────────────────────────────────────────────────────

-- Insert placeholders for the three built-in templates.
-- The real schema_json is generated server-side from src/lib/drce/defaults.ts
-- and the API will upsert the full JSON on first boot.
-- We set template_key now so the API can do an ON DUPLICATE KEY UPDATE safely.

INSERT IGNORE INTO dvcf_documents (id, school_id, document_type, name, description, schema_json, schema_version, is_default, template_key)
VALUES
  (1, NULL, 'report_card', 'Default Template',   'Classic DRAIS report card',            '{}', 1, 1, 'drais_default'),
  (2, NULL, 'report_card', 'Modern Clean',        'Contemporary teal-green design',       '{}', 1, 0, 'modern_clean'),
  (3, NULL, 'report_card', 'Northgate Classic',   'Traditional Northgate style',          '{}', 1, 0, 'northgate_classic');

-- ────────────────────────────────────────────────────────────────────────────
-- Compatibility view: keep old report_templates accessible as drce_compat_view
-- so the existing Kitchen still works without change.
-- ────────────────────────────────────────────────────────────────────────────
-- (Uncomment if report_templates table exists and you want a view)
-- CREATE OR REPLACE VIEW drce_compat_view AS
--   SELECT id, name, description, schema_json AS layout_json, is_default, school_id, template_key
--   FROM dvcf_documents;
