-- 060 - notification_outbox.claim_token: which drain run owns a row while it is 'sending'.
--
-- Overlapping drains (several warm instances, cron + device heartbeat) used to re-select
-- "rows in 'sending' attempted in the last 30 seconds", which included each other's rows, so
-- the same attendance SMS went out two or more times (16-70 extra SMS per school day measured
-- 2026-09-29 .. 2026-10-12). A run now stamps its batch with a unique token and only reads and
-- updates rows carrying that token.
--
-- Also added on demand by ensureClaimColumn() in src/lib/notifications/drain.ts.
--
-- ROLLBACK:
--   ALTER TABLE notification_outbox DROP KEY idx_outbox_claim, DROP COLUMN claim_token;

-- Two statements: TiDB rejects adding a column and an index on it in a single ALTER.
ALTER TABLE notification_outbox ADD COLUMN claim_token VARCHAR(40) DEFAULT NULL;
ALTER TABLE notification_outbox ADD KEY idx_outbox_claim (claim_token);
