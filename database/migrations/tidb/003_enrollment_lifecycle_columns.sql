-- 003 — Phase 2G/2I enrollment lifecycle columns.
--
-- The identity state stays in `status`
--   (active | pending_capture | suspended | revoked | transferred)
-- and the capture pipeline state lives in `capture_status`:
--   not_requested | command_queued | command_sent | awaiting_capture
--   | template_received | captured | failed | expired
-- The UI maps the combination onto the human lifecycle
-- (INITIATED → DEVICE_COMMAND_QUEUED → … → ACTIVE / FAILED / EXPIRED
--  / REVOKED). VARCHAR instead of ENUM so states can evolve without
-- ALTERs.
--
-- ADD COLUMN IF NOT EXISTS is supported by TiDB; the runner also
-- tolerates duplicate-column errors for MySQL local runs.

ALTER TABLE biometric_enrollments
  ADD COLUMN IF NOT EXISTS capture_status VARCHAR(24) NOT NULL DEFAULT 'not_requested';

ALTER TABLE biometric_enrollments
  ADD COLUMN IF NOT EXISTS captured_at DATETIME DEFAULT NULL;

ALTER TABLE biometric_enrollments
  ADD COLUMN IF NOT EXISTS last_seen_on_device_at DATETIME DEFAULT NULL;

ALTER TABLE biometric_enrollments
  ADD COLUMN IF NOT EXISTS updated_by BIGINT DEFAULT NULL;

ALTER TABLE biometric_enrollments
  ADD INDEX IF NOT EXISTS idx_capture (school_id, capture_status);

-- Ensure the identity enum includes pending_capture on installs that
-- predate Phase 1 (MODIFY is a no-op when already current).
ALTER TABLE biometric_enrollments
  MODIFY status ENUM('active','pending_capture','suspended','revoked','transferred') NOT NULL DEFAULT 'active';

-- Enrollments that already have a captured template are 'captured';
-- active ones without explicit state stay 'not_requested' (unknown
-- history — the next capture event will stamp them).
UPDATE biometric_enrollments be
   SET be.capture_status = 'captured',
       be.captured_at = COALESCE(be.captured_at, (
         SELECT MIN(bt.captured_at) FROM biometric_templates bt WHERE bt.enrollment_id = be.id
       ))
 WHERE be.capture_status = 'not_requested'
   AND EXISTS (SELECT 1 FROM biometric_templates bt WHERE bt.enrollment_id = be.id);
