-- Arabic Localization Batch 2 — additive Arabic display fields.
-- Every column is nullable and purely additive: English columns are never
-- touched, and a NULL Arabic value means "fall back to English" at read time.
-- subjects.name_ar and the schools.arabic_* columns already exist, so they are
-- intentionally not repeated here.

-- People — the core identity used by students and staff. `people` has
-- first_name / last_name / other_name (no middle/full), so we mirror those and
-- add a full_name_ar for cases where the Arabic full form is not just a join.
ALTER TABLE people ADD COLUMN IF NOT EXISTS first_name_ar VARCHAR(190) NULL;
ALTER TABLE people ADD COLUMN IF NOT EXISTS last_name_ar  VARCHAR(190) NULL;
ALTER TABLE people ADD COLUMN IF NOT EXISTS other_name_ar VARCHAR(190) NULL;
ALTER TABLE people ADD COLUMN IF NOT EXISTS full_name_ar  VARCHAR(255) NULL;

-- Staff carries a denormalised first_name / last_name alongside person_id, so
-- give it the same Arabic mirrors for the rare staff-only records.
ALTER TABLE staff ADD COLUMN IF NOT EXISTS first_name_ar VARCHAR(190) NULL;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS last_name_ar  VARCHAR(190) NULL;

-- Org units and academic structure.
ALTER TABLE classes      ADD COLUMN IF NOT EXISTS name_ar VARCHAR(190) NULL;
ALTER TABLE streams      ADD COLUMN IF NOT EXISTS name_ar VARCHAR(190) NULL;
ALTER TABLE departments  ADD COLUMN IF NOT EXISTS name_ar VARCHAR(190) NULL;
ALTER TABLE terms        ADD COLUMN IF NOT EXISTS name_ar VARCHAR(190) NULL;
ALTER TABLE result_types ADD COLUMN IF NOT EXISTS name_ar VARCHAR(190) NULL;

-- Finance + programs (configurable display labels).
ALTER TABLE fee_items         ADD COLUMN IF NOT EXISTS name_ar VARCHAR(190) NULL;
ALTER TABLE programs          ADD COLUMN IF NOT EXISTS name_ar VARCHAR(190) NULL;
ALTER TABLE academic_programs ADD COLUMN IF NOT EXISTS name_ar VARCHAR(190) NULL;
