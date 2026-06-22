-- Attendance policy scoping (Phase 1) — additive, non-breaking.
-- attendance_rules already had priority + applies_to(role) + boarding_scope +
-- effective dates; this generalises scope so a rule can target a class, stream,
-- department, device, or an individual learner/staff, resolved with precedence
-- by src/lib/attendance/policy-resolver.ts. Existing school-wide settings are
-- preserved (migrated to scope_type school/role). Idempotent.

ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS scope_type VARCHAR(20) NOT NULL DEFAULT 'school';
ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS scope_id BIGINT NULL;

-- Derive scope_type for pre-existing rows (only those still at the default).
UPDATE attendance_rules
   SET scope_type = CASE
     WHEN boarding_scope IN ('boarding','day') THEN 'boarding'
     WHEN applies_to IN ('students','teachers') THEN 'role'
     ELSE 'school' END
 WHERE scope_type = 'school';
