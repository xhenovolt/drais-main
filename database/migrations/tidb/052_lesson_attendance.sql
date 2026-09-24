-- 052 - Timetable-aware biometric LESSON attendance (attendance phases 6/7).
--
-- 1. The structured timetable tables (timetable_periods / timetable_entries /
--    subject_weekly_periods) were only ever defined in a hand-run file
--    (database/migrations/timetable_structured.sql) and DO NOT EXIST in
--    production, although /academics/timetable and /api/timetable-* read them.
--    Created here, identical shape, IF NOT EXISTS.
-- 2. lesson_attendance_settings  - per-school policy (all windows configurable, disabled by default,
--                                  so existing schools see zero behaviour change).
-- 3. device_attendance_scopes    - what each biometric device is FOR (gate / lesson / shared,
--                                  optionally pinned to a class/stream/room).
-- 4. lesson_occurrences          - one row per (timetable entry, date): an immutable SNAPSHOT of
--                                  the lesson (class, subject, teacher, times) so later timetable
--                                  edits never rewrite history.
-- 5. lesson_attendance           - derived per-student verdict per occurrence, kept separate from
--                                  school-entry attendance_records and from teacher attendance.
--
-- All additive. No existing table is altered.
--
-- ROLLBACK (order matters; nothing else references these):
--   DROP TABLE IF EXISTS lesson_attendance;
--   DROP TABLE IF EXISTS lesson_occurrences;
--   DROP TABLE IF EXISTS device_attendance_scopes;
--   DROP TABLE IF EXISTS lesson_attendance_settings;
--   -- timetable_* tables: only drop if they were created by this migration and hold no data.

CREATE TABLE IF NOT EXISTS timetable_periods (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  name VARCHAR(50) NOT NULL,
  short_name VARCHAR(10) DEFAULT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  period_order INT NOT NULL DEFAULT 0,
  is_break BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school_order (school_id, period_order),
  UNIQUE KEY unique_school_period (school_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS timetable_entries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  day_of_week TINYINT NOT NULL,
  period_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  stream_id BIGINT DEFAULT NULL,
  subject_id BIGINT NOT NULL,
  teacher_id BIGINT DEFAULT NULL,
  room VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school (school_id),
  INDEX idx_class_day (class_id, day_of_week),
  INDEX idx_teacher_day (teacher_id, day_of_week, period_id),
  INDEX idx_stream_day (stream_id, day_of_week, period_id),
  INDEX idx_room_day (room, day_of_week, period_id),
  UNIQUE KEY unique_slot (school_id, day_of_week, period_id, class_id, stream_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS subject_weekly_periods (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  class_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  periods_per_week INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_class_subject (school_id, class_id, subject_id),
  INDEX idx_class (class_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lesson_attendance_settings (
  school_id BIGINT NOT NULL PRIMARY KEY,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  checkin_before_minutes INT NOT NULL DEFAULT 10,
  grace_minutes INT NOT NULL DEFAULT 5,
  late_until_minutes INT NOT NULL DEFAULT 20,
  min_presence_minutes INT NOT NULL DEFAULT 0,
  absent_finalize_delay_minutes INT NOT NULL DEFAULT 15,
  unmapped_device_scope VARCHAR(12) NOT NULL DEFAULT 'shared',
  auto_roster TINYINT(1) NOT NULL DEFAULT 1,
  updated_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_attendance_scopes (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  device_sn VARCHAR(64) NOT NULL,
  scope VARCHAR(12) NOT NULL DEFAULT 'shared',
  class_id BIGINT DEFAULT NULL,
  stream_id BIGINT DEFAULT NULL,
  room VARCHAR(50) DEFAULT NULL,
  updated_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_device_scope (school_id, device_sn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lesson_occurrences (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  timetable_entry_id BIGINT NOT NULL,
  lesson_date DATE NOT NULL,
  class_id BIGINT NOT NULL,
  stream_id BIGINT DEFAULT NULL,
  subject_id BIGINT NOT NULL,
  teacher_id BIGINT DEFAULT NULL,
  room VARCHAR(50) DEFAULT NULL,
  period_name VARCHAR(50) DEFAULT NULL,
  start_at DATETIME NOT NULL,
  end_at DATETIME NOT NULL,
  term_id BIGINT DEFAULT NULL,
  academic_year_id BIGINT DEFAULT NULL,
  status VARCHAR(12) NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_occurrence (school_id, timetable_entry_id, lesson_date),
  KEY idx_occ_day (school_id, lesson_date, class_id),
  KEY idx_occ_teacher (school_id, teacher_id, lesson_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lesson_attendance (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  occurrence_id BIGINT NOT NULL,
  person_id BIGINT NOT NULL,
  student_id BIGINT DEFAULT NULL,
  status VARCHAR(12) NOT NULL,
  source VARCHAR(12) NOT NULL DEFAULT 'biometric',
  first_punch_at DATETIME DEFAULT NULL,
  last_punch_at DATETIME DEFAULT NULL,
  punch_count INT NOT NULL DEFAULT 0,
  minutes_late INT NOT NULL DEFAULT 0,
  device_sn VARCHAR(64) DEFAULT NULL,
  exception VARCHAR(40) DEFAULT NULL,
  reason VARCHAR(255) DEFAULT NULL,
  corrected_by BIGINT DEFAULT NULL,
  corrected_at DATETIME DEFAULT NULL,
  computed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_lesson_person (occurrence_id, person_id),
  KEY idx_la_school_person (school_id, person_id),
  KEY idx_la_school_status (school_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
