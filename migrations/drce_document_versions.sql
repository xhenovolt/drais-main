-- DRCE Phase F — document version history.
-- Additive. dvcf_documents remains the active row (single source of truth for
-- "what is the current document"); drce_document_versions records every
-- save as an immutable snapshot, enabling per-save undo across sessions,
-- side-by-side diff, and one-click restore.
--
-- A version row is written by the PUT handler AFTER a successful update.
-- Versions are numbered per-document, monotonically; gaps are not allowed.

CREATE TABLE IF NOT EXISTS drce_document_versions (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  document_id     BIGINT       NOT NULL,
  version_no      INT          NOT NULL,                     -- per-document, 1-based
  schema_json     LONGTEXT     NOT NULL,                     -- full DRCEDocument snapshot
  name            VARCHAR(100) NULL,                         -- doc name at the time of save
  change_summary  VARCHAR(255) NULL,                         -- optional human label
  author_user_id  BIGINT       NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_doc_version (document_id, version_no),
  KEY idx_doc_created (document_id, created_at)
);
