-- First Arrival Health (per-school resilience layer for date-rollover
-- anomalies). Fully additive — never touches attendance_raw_events DDL or
-- rows; this is a read-only analysis layer over it.
--
--   attendance_first_arrival_anchors  a school's bounded ~15-30 person
--                                     "early arriver" cohort, learned from
--                                     history (median/MAD arrival minute).
--                                     Non-anchor candidate rows are kept
--                                     too (is_anchor=0) as a cheap audit
--                                     trail of who dropped out of rank.
--   attendance_first_arrival_health   one row per school+day: the school-
--                                     wide verdict (status/confidence/
--                                     evidence/recommendation), mirroring
--                                     device_clock_health's shape but
--                                     school-scoped instead of per-device.

CREATE TABLE IF NOT EXISTS attendance_first_arrival_anchors (
  id                     BIGINT       PRIMARY KEY AUTO_INCREMENT,
  school_id              BIGINT       NOT NULL,
  person_id              BIGINT       NOT NULL,
  role_type              VARCHAR(16)  DEFAULT NULL,   -- student | staff
  display_name           VARCHAR(255) DEFAULT NULL,
  median_arrival_minute  INT          DEFAULT NULL,   -- minute-of-day, school-local
  mad_minutes            INT          DEFAULT NULL,
  sample_days            INT          NOT NULL DEFAULT 0,
  window_days            INT          NOT NULL DEFAULT 120,
  earliness_rank         INT          DEFAULT NULL,   -- 1 = earliest/most consistent
  is_anchor              TINYINT      NOT NULL DEFAULT 0,
  computed_at            TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_school_person (school_id, person_id),
  KEY idx_school_anchor (school_id, is_anchor, earliness_rank)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_first_arrival_health (
  id                     BIGINT       PRIMARY KEY AUTO_INCREMENT,
  school_id              BIGINT       NOT NULL,
  local_date             DATE         NOT NULL,
  status                 VARCHAR(16)  NOT NULL,       -- trusted | review | anomaly
  confidence             INT          NOT NULL,       -- 0..100
  anchors_expected       INT          NOT NULL DEFAULT 0,
  anchors_present        INT          NOT NULL DEFAULT 0,
  anchors_missing        INT          NOT NULL DEFAULT 0,
  match_pct              INT          DEFAULT NULL,
  observed_first_minute  INT          DEFAULT NULL,
  baseline_days          INT          NOT NULL DEFAULT 0,
  recommendation         VARCHAR(500) DEFAULT NULL,
  likely_cause           VARCHAR(64)  DEFAULT NULL,
  shift_simulation       LONGTEXT     DEFAULT NULL,   -- JSON, when boundary-shift ran
  created_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_school_day (school_id, local_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
