-- =============================
-- 19) TAHFIZ MODULE (Books, Groups, Plans, Records)
-- =============================
CREATE TABLE IF NOT EXISTS tahfiz_books (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  total_units INT DEFAULT NULL,
  unit_type VARCHAR(50) DEFAULT 'verse',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tahfiz_groups (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  name VARCHAR(100) NOT NULL,
  teacher_id BIGINT NOT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tahfiz_group_members (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  group_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  role VARCHAR(30) DEFAULT 'member',
  UNIQUE KEY uniq_group_student (group_id, student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tahfiz_plans (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  book_id BIGINT DEFAULT NULL,
  teacher_id BIGINT NOT NULL,
  class_id BIGINT DEFAULT NULL,
  stream_id BIGINT DEFAULT NULL,
  group_id BIGINT DEFAULT NULL,
  assigned_date DATE NOT NULL,
  portion_text VARCHAR(255) NOT NULL,
  portion_unit VARCHAR(50) DEFAULT 'verse',
  expected_length INT DEFAULT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('tilawa','hifz','muraja','other')),
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school_date (school_id, assigned_date),
  INDEX idx_teacher (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tahfiz_records (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  plan_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  group_id BIGINT DEFAULT NULL,
  presented TINYINT(1) DEFAULT 0,
  presented_length INT DEFAULT 0,
  retention_score DECIMAL(5,2) DEFAULT NULL,
  mark DECIMAL(5,2) DEFAULT NULL,
  status VARCHAR(30) DEFAULT 'pending',
  notes TEXT DEFAULT NULL,
  recorded_by BIGINT DEFAULT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_school_student (school_id, student_id),
  INDEX idx_plan (plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tahfiz_attendance (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  group_id BIGINT NOT NULL,
  date DATE NOT NULL,
  status ENUM('present','absent','late','excused') DEFAULT 'present',
  remarks TEXT DEFAULT NULL,
  recorded_by BIGINT DEFAULT NULL,
  recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tahfiz_evaluations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  evaluator_id BIGINT NOT NULL,
  type ENUM('monthly','termly','annual','special') DEFAULT 'monthly',
  retention_score DECIMAL(5,2) DEFAULT NULL,
  tajweed_score DECIMAL(5,2) DEFAULT NULL,
  voice_score DECIMAL(5,2) DEFAULT NULL,
  discipline_score DECIMAL(5,2) DEFAULT NULL,
  remarks TEXT DEFAULT NULL,
  evaluated_at DATE DEFAULT CURRENT_DATE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tahfiz_portions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  student_id BIGINT NOT NULL,
  portion_name VARCHAR(100) NOT NULL,
  surah_name VARCHAR(100) DEFAULT NULL,
  ayah_from INT DEFAULT NULL,
  ayah_to INT DEFAULT NULL,
  juz_number INT DEFAULT NULL,
  page_from INT DEFAULT NULL,
  page_to INT DEFAULT NULL,
  status ENUM('pending', 'in_progress', 'completed', 'skipped', 'review') DEFAULT 'pending',
  difficulty_level ENUM('easy', 'medium', 'hard') DEFAULT 'medium',
  estimated_days INT DEFAULT 1,
  notes TEXT DEFAULT NULL,
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  reviewed_by BIGINT DEFAULT NULL,
  verified_by BIGINT DEFAULT NULL,
  verification_status ENUM('unverified', 'verified', 'rejected') DEFAULT 'unverified'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS tahfiz_migration_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  message VARCHAR(500) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tahfiz_migration_log (message) VALUES
  ('Tahfiz module: created tahfiz_books (stores Qur''an, Yassarna, Tuhfa, etc.)'),
  ('Tahfiz module: created tahfiz_groups (halaqat) and tahfiz_group_members (group assignments)'),
  ('Tahfiz module: created tahfiz_plans and tahfiz_records (memorization plans & daily records)'),
  ('Tahfiz module: updated tahfiz_plans and tahfiz_records to optionally reference book_id and group_id'),
  ('Tahfiz module: all changes added without removing existing tables or data. You can view human-friendly log in tahfiz_migration_log table.');
--   evaluator_id BIGINT NOT NULL,
--   type ENUM('monthly','termly','annual','special') DEFAULT 'monthly',
--   retention_score DECIMAL(5,2) DEFAULT NULL,
--   tajweed_score DECIMAL(5,2) DEFAULT NULL,
--   voice_score DECIMAL(5,2) DEFAULT NULL,
--   discipline_score DECIMAL(5,2) DEFAULT NULL,
--   remarks TEXT DEFAULT NULL,
--   evaluated_at DATE DEFAULT CURRENT_DATE
-- );

CREATE TABLE IF NOT EXISTS tahfiz_portions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,

  -- Links to student
  student_id BIGINT NOT NULL,
  portion_name VARCHAR(100) NOT NULL,          -- e.g. "Surah Al-Baqarah: 1–10"
  surah_name VARCHAR(100) DEFAULT NULL,        -- e.g. "Al-Baqarah"
  ayah_from INT DEFAULT NULL,                  -- starting ayah
  ayah_to INT DEFAULT NULL,                    -- ending ayah
  juz_number INT DEFAULT NULL,                 -- optional, e.g. 1–30
  page_from INT DEFAULT NULL,                  -- mushaf page start
  page_to INT DEFAULT NULL,                    -- mushaf page end

  -- Progress tracking
  status ENUM('pending', 'in_progress', 'completed', 'skipped', 'review') 
         DEFAULT 'pending',
  difficulty_level ENUM('easy', 'medium', 'hard') DEFAULT 'medium',
  estimated_days INT DEFAULT 1,
  notes TEXT DEFAULT NULL,

  -- Timestamps
  assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,

  -- Optional metadata
  reviewed_by BIGINT DEFAULT NULL,             -- teacher who checked
  verified_by BIGINT DEFAULT NULL,             -- admin/senior sheikh who verified
  verification_status ENUM('unverified', 'verified', 'rejected') DEFAULT 'unverified'

);


INSERT INTO tahfiz_migration_log (message) VALUES
  ('Tahfiz module: created tahfiz_books (stores Qur''an, Yassarna, Tuhfa, etc.)'),
  ('Tahfiz module: created tahfiz_groups (halaqat) and tahfiz_group_members (group assignments)'),
  ('Tahfiz module: created tahfiz_plans and tahfiz_records (memorization plans & daily records)'),
  ('Tahfiz module: updated tahfiz_plans and tahfiz_records to optionally reference book_id and group_id'),
  ('Tahfiz module: all changes added without removing existing tables or data. You can view human-friendly log in tahfiz_migration_log table.');

-- Ensure plans & records have optional references to book & group
ALTER TABLE tahfiz_plans
  ADD COLUMN IF NOT EXISTS book_id BIGINT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS group_id BIGINT DEFAULT NULL;

ALTER TABLE tahfiz_records
  ADD COLUMN IF NOT EXISTS group_id BIGINT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS tahfiz_migration_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  message VARCHAR(500) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO tahfiz_migration_log (message) VALUES
  ('Tahfiz module created as part of the main schema. Tables: tahfiz_books, tahfiz_groups, tahfiz_group_members, tahfiz_plans (updated), tahfiz_records (updated).');
