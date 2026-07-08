-- Staff/learner SHIFT engine. attendance_rules models a single school schedule;
-- real institutions run multiple shifts (morning/afternoon/night/security/…),
-- each with its own windows + thresholds, assignable to staff / departments /
-- roles with precedence. These two tables add that without touching
-- attendance_rules (which stays the school-default fallback).

-- A named shift definition.
CREATE TABLE IF NOT EXISTS shifts (
  id                             BIGINT       NOT NULL AUTO_INCREMENT,
  school_id                      BIGINT       NOT NULL,
  name                           VARCHAR(100) NOT NULL,
  code                           VARCHAR(40)  NULL,
  applies_to                     VARCHAR(16)  NOT NULL DEFAULT 'staff', -- staff | learner | both
  start_time                     TIME         NOT NULL,
  end_time                       TIME         NOT NULL,
  -- how many minutes before start_time an arrival is still "on time".
  arrival_window_minutes         INT          NOT NULL DEFAULT 30,
  -- minutes after start_time before an arrival is "late".
  late_threshold_minutes         INT          NOT NULL DEFAULT 15,
  -- minutes before end_time that a departure counts as "early leave".
  early_leave_threshold_minutes  INT          NOT NULL DEFAULT 30,
  -- minutes after end_time that begin to count as overtime (NULL = no overtime).
  overtime_after_minutes         INT          NULL,
  -- bitmask of working days, bit0=Mon … bit6=Sun. 31 = Mon–Fri.
  weekday_mask                   TINYINT      NOT NULL DEFAULT 31,
  -- 1 when end_time < start_time (e.g. 18:00 → 06:00 night security).
  crosses_midnight               TINYINT      NOT NULL DEFAULT 0,
  effective_from                 DATE         NULL,
  effective_to                   DATE         NULL,
  status                         VARCHAR(16)  NOT NULL DEFAULT 'active',
  created_by                     BIGINT       NULL,
  created_at                     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at                     TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school (school_id, status)
);

-- Assigns a shift to a target. Precedence at resolve time:
--   staff (4) > department (3) > role (2) > school-default (1).
CREATE TABLE IF NOT EXISTS shift_assignments (
  id             BIGINT      NOT NULL AUTO_INCREMENT,
  school_id      BIGINT      NOT NULL,
  shift_id       BIGINT      NOT NULL,
  target_type    VARCHAR(16) NOT NULL,   -- staff | department | role | school
  target_id      BIGINT      NULL,       -- staff_id / department_id / role_id; NULL for school default
  effective_from DATE        NULL,
  effective_to   DATE        NULL,
  status         VARCHAR(16) NOT NULL DEFAULT 'active',
  created_by     BIGINT      NULL,
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school_target (school_id, target_type, target_id, status),
  KEY idx_shift (shift_id)
);
