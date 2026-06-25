-- Template Kitchen lifecycle (Founder-Independence Phase 2).
-- Adds an archive flag so school templates can be hidden without hard-deleting
-- (built-ins, school_id IS NULL, are already delete-protected by the API).

ALTER TABLE report_templates ADD COLUMN IF NOT EXISTS is_archived TINYINT NOT NULL DEFAULT 0;
