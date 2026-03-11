-- =============================================
-- STRUCTURED TIMETABLE MODULE
-- Tables: timetable_periods, timetable_entries
-- Supports conflict detection and auto-generation
-- =============================================

-- Add unique constraints to streams and subjects if missing
ALTER TABLE streams ADD UNIQUE KEY IF NOT EXISTS unique_class_stream (class_id, name);
ALTER TABLE subjects ADD UNIQUE KEY IF NOT EXISTS unique_school_subject (school_id, name);

-- Add timestamps to streams if missing
ALTER TABLE streams ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE streams ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- Add timestamps to subjects if missing  
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;

-- =============================================
-- 1) TIMETABLE PERIODS
-- Defines the time slots for a school day
-- =============================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Period/timeslot definitions per school';

-- =============================================
-- 2) TIMETABLE ENTRIES
-- Each row = one scheduled lesson in the grid
-- =============================================
CREATE TABLE IF NOT EXISTS timetable_entries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL DEFAULT 1,
  day_of_week TINYINT NOT NULL COMMENT '1=Monday, 5=Friday',
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
  
  -- Prevent duplicate: same class/stream cannot have two entries in the same slot
  UNIQUE KEY unique_slot (school_id, day_of_week, period_id, class_id, stream_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Timetable grid entries';

-- =============================================
-- 3) SUBJECT WEEKLY REQUIREMENTS (for auto-generator)
-- How many periods per week a subject needs in a class
-- =============================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Subject weekly period requirements';

-- =============================================
-- INSERT DEFAULT PERIODS (typical school day)
-- Schools can customize these
-- =============================================
INSERT IGNORE INTO timetable_periods (school_id, name, short_name, start_time, end_time, period_order, is_break)
VALUES
  (1, 'Period 1', 'P1', '08:00:00', '08:40:00', 1, FALSE),
  (1, 'Period 2', 'P2', '08:40:00', '09:20:00', 2, FALSE),
  (1, 'Period 3', 'P3', '09:20:00', '10:00:00', 3, FALSE),
  (1, 'Break', 'BRK', '10:00:00', '10:30:00', 4, TRUE),
  (1, 'Period 4', 'P4', '10:30:00', '11:10:00', 5, FALSE),
  (1, 'Period 5', 'P5', '11:10:00', '11:50:00', 6, FALSE),
  (1, 'Period 6', 'P6', '11:50:00', '12:30:00', 7, FALSE),
  (1, 'Lunch', 'LCH', '12:30:00', '13:30:00', 8, TRUE),
  (1, 'Period 7', 'P7', '13:30:00', '14:10:00', 9, FALSE),
  (1, 'Period 8', 'P8', '14:10:00', '14:50:00', 10, FALSE);
