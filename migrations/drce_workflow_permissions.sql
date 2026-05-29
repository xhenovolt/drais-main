-- ============================================================================
-- P4 — DRCE governance: workflow lifecycle + granular permissions.
--
-- Adds a publish/approve/archive workflow on top of dvcf_documents so a school
-- can govern who edits, approves, and ships templates without involving the
-- manufacturer. Five permissions gate the actions; legacy behaviour is
-- preserved because every existing row is backfilled to status='published'.
--
-- Lifecycle:
--   draft → submitted → (approved | rejected back to draft) → published → archived
--
-- The status column is INFORMATIONAL only at the API layer until the editor
-- workflow UI consumes it (which this round wires up). Render paths use the
-- latest schema_json regardless of status — they don't filter by it — so an
-- approval-pending edit doesn't accidentally hide a published template.
--
-- Rollback:
--   ALTER TABLE dvcf_documents
--     DROP COLUMN status, DROP COLUMN submitted_at, DROP COLUMN submitted_by,
--     DROP COLUMN approved_at, DROP COLUMN approved_by, DROP COLUMN approval_notes,
--     DROP COLUMN published_at, DROP COLUMN published_by,
--     DROP COLUMN archived_at,  DROP COLUMN archived_by;
--   DELETE FROM permissions WHERE code IN ('drce.view','drce.edit','drce.publish','drce.approve','drce.admin');
-- ============================================================================

ALTER TABLE dvcf_documents
  ADD COLUMN IF NOT EXISTS status
    ENUM('draft','pending_approval','approved','published','archived')
    NOT NULL DEFAULT 'draft' AFTER template_category,
  ADD COLUMN IF NOT EXISTS submitted_at    DATETIME    NULL,
  ADD COLUMN IF NOT EXISTS submitted_by    BIGINT      NULL,
  ADD COLUMN IF NOT EXISTS approved_at     DATETIME    NULL,
  ADD COLUMN IF NOT EXISTS approved_by     BIGINT      NULL,
  ADD COLUMN IF NOT EXISTS approval_notes  VARCHAR(500) NULL,
  ADD COLUMN IF NOT EXISTS published_at    DATETIME    NULL,
  ADD COLUMN IF NOT EXISTS published_by    BIGINT      NULL,
  ADD COLUMN IF NOT EXISTS archived_at     DATETIME    NULL,
  ADD COLUMN IF NOT EXISTS archived_by     BIGINT      NULL;

-- Backfill: every existing row counts as already-published so the new
-- column doesn't hide anything live. Built-in catalog rows (school_id NULL)
-- are obviously already published.
UPDATE dvcf_documents
   SET status       = 'published',
       published_at = COALESCE(published_at, updated_at, created_at, NOW())
 WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS idx_dvcf_status ON dvcf_documents (school_id, status);

-- Seed the five granular permissions. INSERT IGNORE keeps migration
-- idempotent — re-running adds nothing.
INSERT IGNORE INTO permissions (code, module, resource, action, description, is_active)
VALUES
  ('drce.view',    'drce', 'template', 'view',    'View DRCE templates and read documents',            1),
  ('drce.edit',    'drce', 'template', 'edit',    'Edit DRCE templates; create + update drafts',       1),
  ('drce.approve', 'drce', 'template', 'approve', 'Approve a pending DRCE template (workflow gate)',   1),
  ('drce.publish', 'drce', 'template', 'publish', 'Publish an approved DRCE template school-wide',     1),
  ('drce.admin',   'drce', 'template', 'admin',   'Full DRCE governance: delete, archive, manage blocks', 1);
