-- Founder-independence Phase 1 — clear, school-configurable enrollment programs.
-- Adds a human display label + stable code + curriculum body + default flag so the
-- UI shows understandable names (UNEB/Cambridge/Tahfiz) instead of raw internal
-- text. `is_active` already serves as the archive flag.
-- curriculum_body values: UNEB | Cambridge | Tahfiz | Mixed | Other

ALTER TABLE programs ADD COLUMN IF NOT EXISTS display_name    VARCHAR(120) NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS code            VARCHAR(40)  NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS curriculum_body VARCHAR(60)  NULL;
ALTER TABLE programs ADD COLUMN IF NOT EXISTS eligibility     VARCHAR(30)  NOT NULL DEFAULT 'all_learners';
ALTER TABLE programs ADD COLUMN IF NOT EXISTS is_default      TINYINT      NOT NULL DEFAULT 0;

UPDATE programs SET display_name = name WHERE display_name IS NULL OR display_name = '';
