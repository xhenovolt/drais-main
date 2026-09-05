-- 046 — devices.school_id (and sibling ADMS logging tables) must allow
-- NULL so a brand-new, never-configured device can be auto-registered
-- as UNASSIGNED (school_id = NULL) instead of silently failing every
-- insert.
--
-- Root cause: these tables predate multitenancy and were declared
-- `school_id BIGINT NOT NULL DEFAULT 1`. Migration 004's
-- `ADD COLUMN IF NOT EXISTS school_id BIGINT DEFAULT NULL` was a no-op
-- here — the column already existed, so it never touched the NOT NULL
-- constraint. getDeviceSchoolId() correctly resolves an unknown device
-- serial to school_id = NULL, but every insert bound to that NULL
-- (devices, zk_raw_logs, zk_device_logs, zk_parsed_logs,
-- device_sync_state) was then rejected by the database and silently
-- swallowed by the ADMS handler's fire-and-forget try/catch (required
-- so a device only ever sees HTTP 200 "OK"). New devices heartbeated
-- forever but never got a row in `devices`, so they never appeared —
-- assigned or unassigned — in the control panel's device list.
--
-- MODIFY COLUMN (not ADD COLUMN) is required to actually relax an
-- existing NOT NULL constraint. Existing rows keep their current
-- school_id value; only new inserts can now use NULL. Idempotent by
-- nature — re-running is a no-op.

ALTER TABLE devices MODIFY COLUMN school_id BIGINT DEFAULT NULL;
ALTER TABLE zk_raw_logs MODIFY COLUMN school_id BIGINT DEFAULT NULL;
ALTER TABLE zk_device_logs MODIFY COLUMN school_id BIGINT DEFAULT NULL;
ALTER TABLE zk_parsed_logs MODIFY COLUMN school_id BIGINT DEFAULT NULL;
ALTER TABLE device_sync_state MODIFY COLUMN school_id BIGINT DEFAULT NULL;
