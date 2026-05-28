-- DRCE Phase H — Template inheritance + shared blocks.
--
-- Two additive mechanisms:
--   1. Template inheritance:  dvcf_documents.parent_id → another doc.
--      The parent's sections are merged with the child's at load time —
--      child sections with the same id REPLACE the parent's; new child
--      ids append. Parent theme/watermark/commentRules/teacherMappings
--      provide a baseline the child can override field-by-field.
--   2. Shared blocks:         drce_blocks is a library of reusable section
--      subtrees (a custom header, a footer container, a fixed comment-rule
--      ribbon). A new `block_ref` section in a document references one and
--      its contents are inlined at load time. Editing the block updates
--      every document that references it.
--
-- Both are loader-side resolution: the renderer remains a pure function of
-- a flat DRCEDocument. No render-layer change.

ALTER TABLE dvcf_documents
  ADD COLUMN IF NOT EXISTS parent_id BIGINT NULL DEFAULT NULL
    COMMENT 'Phase H — parent template id; child inherits then overrides';
ALTER TABLE dvcf_documents
  ADD INDEX IF NOT EXISTS idx_dvcf_parent (parent_id);

CREATE TABLE IF NOT EXISTS drce_blocks (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id       BIGINT       NULL DEFAULT NULL
    COMMENT 'NULL = global block available to every school; non-null = school-owned',
  name            VARCHAR(120) NOT NULL,
  description     VARCHAR(255) NOT NULL DEFAULT '',
  kind            ENUM('header','footer','comment_rules','custom') NOT NULL DEFAULT 'custom',
  /* schema_json is the DRCESection (typically a container with children).
     The renderer treats it as a regular section once inlined. */
  schema_json     LONGTEXT     NOT NULL,
  created_by      BIGINT       NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_drce_blocks_school (school_id),
  KEY idx_drce_blocks_kind   (kind),
  KEY idx_drce_blocks_name   (name)
);
