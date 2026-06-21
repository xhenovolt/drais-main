-- Track B / B1 — DRAIS platform controls for Jeton master-control.
-- Additive + idempotent. Applied to TiDB via scripts (TiDB rejects
-- ADD UNIQUE INDEX IF NOT EXISTS and CREATE TRIGGER, so those are guarded /
-- omitted in code). Recorded here for repo history.

-- 1. Hard per-school SMS kill-switch (platform/Jeton controlled). Default ON.
--    Enforced in comm/dispatcher.ts (auto + manual), notifications/drain.ts,
--    /api/admin/comm/broadcast and /api/sms/send.
ALTER TABLE comm_settings ADD COLUMN IF NOT EXISTS sms_enabled TINYINT(1) NOT NULL DEFAULT 1;

-- 2. schools.external_id — the stable opaque tenant id the platform layer
--    exposes (never the internal numeric id). The hardening migration assumed
--    this column already existed (it only backfilled + added a TiDB-unsupported
--    trigger), so it was missing here. Add it additively, backfill UUIDs.
ALTER TABLE schools ADD COLUMN IF NOT EXISTS external_id VARCHAR(64) NULL;
UPDATE schools SET external_id = UUID() WHERE external_id IS NULL OR external_id = '';
-- guarded in code (TiDB has no ADD UNIQUE INDEX IF NOT EXISTS):
--   ALTER TABLE schools ADD UNIQUE INDEX uq_schools_external_id (external_id);
-- NOTE: TiDB has no triggers; new schools must get external_id from app code
-- (or a follow-up). The schools LIST route was also fixed to return the real
-- external_id column instead of `id AS external_id` (+ fixes the cursor).
