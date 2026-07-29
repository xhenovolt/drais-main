-- Phase 4 (docs/audits/BIOMETRIC_CENTRALIZATION_AUDIT.md) — devices as
-- deployment targets need an operator-assigned purpose label (e.g.
-- "Gate Verification", "Staff Room"), distinct from device_name (the
-- device's own identity) and location (physical placement). Nullable,
-- purely additive — no existing reader is affected.
ALTER TABLE devices ADD COLUMN IF NOT EXISTS role_label VARCHAR(64) DEFAULT NULL;
