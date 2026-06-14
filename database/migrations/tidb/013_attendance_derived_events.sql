-- 013 — per-punch derived attendance meaning.
-- Raw punches stay immutable (punch_at, verify_type, source). The
-- engine writes the DERIVED lifecycle event here so logs/popup show
-- "ARRIVED / LATE / CHECKED OUT" instead of the device's raw IN/OUT
-- field. Recomputable: evaluateDay re-derives the whole day.
ALTER TABLE attendance_raw_events ADD COLUMN IF NOT EXISTS derived_event VARCHAR(24) DEFAULT NULL;
ALTER TABLE attendance_raw_events ADD COLUMN IF NOT EXISTS derived_detail VARCHAR(120) DEFAULT NULL;
ALTER TABLE attendance_raw_events ADD INDEX IF NOT EXISTS idx_derived (school_id, derived_event);
