-- ============================================================================
-- school_hours — per-school working & study hours, with per-day overrides
--
-- Two audiences (student, staff) × seven days of the week + a default row
-- that applies when a specific day has no override. Supports the common
-- patterns we care about:
--
--   • A single uniform schedule:                 audience=student, day_of_week=NULL, start='07:30', end='16:00'
--   • Friday early dismissal (Islamic schools):  audience=student, day_of_week=5, start='07:30', end='12:00'
--   • Sunday closed:                             audience=student, day_of_week=0, is_closed=1
--   • Staff arriving earlier than students:      audience=staff, day_of_week=NULL, start='07:00', end='17:00'
--
-- Resolution order at read time (lib/school-hours.ts):
--   1. Exact match on (school_id, audience, day_of_week)
--   2. Fallback to (school_id, audience, day_of_week=NULL)
--   3. Hard fallback if neither exists: no late check, no closure.
--
-- The `late_after_minutes` grace period is OPTIONAL — NULL = strict, no
-- grace. When set, a check-in is treated as "late" only when its time
-- exceeds start_time + late_after_minutes. Replaces the hardcoded
-- 8:30 AM in src/app/api/attendance/biometric/route.ts (Phase 0
-- rigidity finding).
--
-- This table is consulted by:
--   • The ADMS SMS trigger (src/lib/comm/adms-attendance.ts) when
--     deciding whether to emit checkin vs late.
--   • The Phase 1 attendance adapters via the lateAfterHHMM option.
--   • Any future scheduling / period-boundary code.
--
-- Strictly additive. Schools without any row in this table see the
-- pre-migration behaviour (no late computation, no closure).
--
-- Rollback:
--   DROP TABLE school_hours;
-- ============================================================================

CREATE TABLE IF NOT EXISTS school_hours (
  id                   BIGINT       NOT NULL AUTO_INCREMENT,
  school_id            BIGINT       NOT NULL,
  /** Who this row governs. */
  audience             ENUM('student', 'staff') NOT NULL,
  /** 0 = Sunday, 1 = Monday, …, 6 = Saturday. NULL = "default — applies
      to every day that has no specific override". */
  day_of_week          TINYINT      NULL,
  start_time           TIME         NOT NULL,
  end_time             TIME         NOT NULL,
  /** Minutes after start_time that still count as on-time. NULL = strict
      (anything after start_time is late). Most schools use 10-15 min. */
  late_after_minutes   INT          NULL,
  /** When 1, the school is closed for this audience on this day —
      no attendance expected, no SMS. */
  is_closed            TINYINT(1)   NOT NULL DEFAULT 0,
  /** Soft-archive a row without deleting it. */
  is_active            TINYINT(1)   NOT NULL DEFAULT 1,
  /** Free-form note ("Friday Jumu'ah", "exam week", …). */
  notes                VARCHAR(255) NULL,
  created_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  created_by           BIGINT       NULL,

  PRIMARY KEY (id),
  /** One row per (school, audience, day). day_of_week=NULL is treated as a
      distinct value by MySQL UNIQUE, which is exactly the semantic we want:
      a school has at most one default row per audience + at most one
      override row per (audience, day). */
  UNIQUE KEY uk_school_hours_slot (school_id, audience, day_of_week),
  KEY idx_school_hours_school (school_id, audience)
);
