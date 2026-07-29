-- Finance consolidation Stage C (docs/audits/FINANCE_CONSOLIDATION_PLAN.md):
-- learner_fee_adjustments becomes the canonical waiver/discount/override
-- system, replacing waivers_discounts. Before the waivers UI can safely
-- redirect here, this table needs the two things the old one had that this
-- one didn't: a rejection reason, and soft-delete (the old table has full
-- trash support; this one only ever hard-deletes via deleteAdjustment()).
ALTER TABLE learner_fee_adjustments ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT NULL;
ALTER TABLE learner_fee_adjustments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL;
ALTER TABLE learner_fee_adjustments ADD COLUMN IF NOT EXISTS deleted_by BIGINT DEFAULT NULL;
ALTER TABLE learner_fee_adjustments ADD COLUMN IF NOT EXISTS delete_reason VARCHAR(500) DEFAULT NULL;
