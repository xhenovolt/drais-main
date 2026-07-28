-- Finance Consolidation Plan, Stage A (docs/audits/FINANCE_CONSOLIDATION_PLAN.md).
-- Every student bill line (student_fee_items) has always identified its fee
-- by NAME TEXT (`item VARCHAR(120)`) — even rows produced by the newest rule
-- engine (fee_items + fee_eligibility_rules), which has a real catalog with
-- its own id but never wrote it back. Two rows both saying "Tuition" from
-- different upstream systems are indistinguishable text, not a real
-- relationship.
--
-- This is purely additive: a NULLable FK, populated going forward by
-- generateBills() (src/lib/finance/feeRules.ts). No existing row is touched,
-- no existing query breaks. Historical backfill (matching `item` text to
-- fee_items.name per school where unambiguous) is Stage B, not this migration.

ALTER TABLE student_fee_items
  ADD COLUMN IF NOT EXISTS fee_item_id BIGINT NULL
    COMMENT 'FK to fee_items.id — the canonical fee-item catalog. NULL for rows created before this column existed or by a non-catalog path; the fee is still identified by `item` text in that case.';

ALTER TABLE student_fee_items
  ADD INDEX IF NOT EXISTS idx_student_fee_items_fee_item (fee_item_id);
