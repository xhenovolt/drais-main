-- Platform API hardening: dedup webhooks at source, accelerate ops queries.

-- Prevent the same event being enqueued twice for the same subscription.
-- Safe even if emit() is invoked twice (retry storms, race on event emission).
ALTER TABLE webhook_deliveries
  ADD UNIQUE KEY uq_webhook_del_sub_event (subscription_id, event_id);

-- Speed up ops queries (auth failures, scope denials, rate-limit hits per minute).
ALTER TABLE platform_api_audit
  ADD INDEX ix_platform_audit_error_time (error_code, created_at);

-- Speed up the dead-letter scan.
ALTER TABLE webhook_deliveries
  ADD INDEX ix_webhook_del_status_created (status, created_at);

-- ---------------------------------------------------------------------------
-- Tenant-id hardening: guarantee every school has a stable external_id so the
-- platform layer never has to expose the internal numeric id.
-- ---------------------------------------------------------------------------

-- Idempotent backfill — any school missing external_id gets a UUID NOW.
UPDATE schools
   SET external_id = UUID()
 WHERE external_id IS NULL OR external_id = '';

-- Auto-fill on insert so new tenants can't ship without an external_id.
-- (Drop-then-create pattern is safe to re-run.)
DROP TRIGGER IF EXISTS trg_schools_ensure_external_id;
CREATE TRIGGER trg_schools_ensure_external_id
BEFORE INSERT ON schools
FOR EACH ROW
SET NEW.external_id = COALESCE(NULLIF(NEW.external_id, ''), UUID());
