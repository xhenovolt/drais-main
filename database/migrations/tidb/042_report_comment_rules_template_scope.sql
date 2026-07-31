-- Optional per-rule template scoping for the intelligent overall-comment
-- engine (Report Engine Patch Program, Phase II follow-up). A rule with
-- template_id NULL still applies to every template (unchanged, backward
-- compatible); a rule with template_id set only applies when THAT specific
-- dvcf_documents template is being rendered — so a school with multiple
-- report-card templates can give them different comment logic without
-- duplicating or reconfiguring the whole rule set every time they switch.
--
-- This is resolved at RENDER time (src/lib/snapshots/print-state.ts), not
-- only at snapshot generation — a deliberate, documented exception to the
-- snapshot-immutability invariant in src/lib/drce/RENDER_LAYERS.md. See that
-- file's "Overall-comment resolution" section for the accepted tradeoff.
ALTER TABLE report_overall_comment_rules ADD COLUMN IF NOT EXISTS template_id BIGINT NULL AFTER role;
ALTER TABLE report_overall_comment_rules ADD INDEX IF NOT EXISTS idx_school_template (school_id, template_id, is_active);
