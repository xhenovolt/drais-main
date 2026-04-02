-- ============================================================================
-- Migration 021: Report Template Versioning
-- Allows users to revert templates and compare changes.
-- ============================================================================

CREATE TABLE IF NOT EXISTS report_template_versions (
  id            INT NOT NULL AUTO_INCREMENT,
  template_id   INT          NOT NULL,
  version       INT          NOT NULL DEFAULT 1,
  layout_json   LONGTEXT     NOT NULL,
  change_note   VARCHAR(255) NULL,
  created_by    INT          NULL,       -- user_id who saved this version
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id) /*T![auto_id_cache] AUTO_ID_CACHE 1 */,
  INDEX idx_version_template (template_id, version DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
