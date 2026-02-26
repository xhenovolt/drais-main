-- DRAIS v2: Long‑Term, Multi‑Tenant MySQL Schema (UTF8MB4, InnoDB)
-- Foreign key & unique constraints removed as requested.
DROP DATABASE IF EXISTS drais_school;
CREATE DATABASE drais_school CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE drais_school;
-- =============================
-- 0) CONVENTIONS & UTILITIES
-- =============================
CREATE TABLE IF NOT EXISTS audit_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  actor_user_id BIGINT DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT DEFAULT NULL,
  changes_json JSON DEFAULT NULL,
  ip VARCHAR(64) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 1) MULTI‑TENANCY (Schools & Branches)
-- =============================
CREATE TABLE IF NOT EXISTS schools (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  legal_name VARCHAR(200) DEFAULT NULL,
  short_code VARCHAR(50) DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  currency VARCHAR(10) DEFAULT 'UGX',
  address TEXT DEFAULT NULL,
  logo_url VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at VARCHAR(255) DEFAULT NULL,
  deleted_at VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS branches (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at VARCHAR(255) DEFAULT NULL,
  deleted_at VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 2) RBAC (Roles & Permissions)
-- =============================
CREATE TABLE IF NOT EXISTS roles (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  name VARCHAR(80) NOT NULL,
  description TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(120) NOT NULL UNIQUE,
  description TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id BIGINT NOT NULL,
  permission_id BIGINT NOT NULL,
  PRIMARY KEY (role_id, permission_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 3) USERS & PEOPLE
-- =============================
CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  branch_id BIGINT DEFAULT NULL,
  role_id BIGINT DEFAULT NULL,
  username VARCHAR(100) NOT NULL,
  email VARCHAR(150) DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'active',
  last_login VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at VARCHAR(255) DEFAULT NULL,
  deleted_at VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS people (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  other_name VARCHAR(100) DEFAULT NULL,
  gender VARCHAR(15) DEFAULT NULL,
  date_of_birth VARCHAR(255) DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  photo_url VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at VARCHAR(255) DEFAULT NULL,
  deleted_at VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_people (
  user_id BIGINT NOT NULL,
  person_id BIGINT NOT NULL,
  PRIMARY KEY (user_id, person_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 4) GEOGRAPHY (District/County/Subcounty/Parish/Village)
-- =============================
CREATE TABLE IF NOT EXISTS districts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS counties (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  district_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subcounties (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  county_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS parishes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  subcounty_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS villages (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  parish_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 5) STUDENTS, CONTACTS & RELATIONSHIPS
-- =============================
CREATE TABLE IF NOT EXISTS students (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  person_id BIGINT NOT NULL,
  admission_no VARCHAR(50) UNIQUE,
  village_id BIGINT DEFAULT NULL,
  admission_date VARCHAR(255) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'active',
  promotion_status VARCHAR(50) DEFAULT 'pending',
  last_promoted_at TIMESTAMP NULL,
  previous_class_id BIGINT DEFAULT NULL,
  previous_year_id BIGINT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at VARCHAR(255) DEFAULT NULL,
  deleted_at VARCHAR(255) DEFAULT NULL,
  INDEX idx_promotion_status (promotion_status),
  INDEX idx_last_promoted_at (last_promoted_at),
  INDEX idx_school_status_promotion (school_id, status, promotion_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS contacts (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  person_id BIGINT NOT NULL,
  contact_type VARCHAR(30) NOT NULL,
  occupation VARCHAR(120) DEFAULT NULL,
  alive_status VARCHAR(20) DEFAULT NULL,
  date_of_death VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at VARCHAR(255) DEFAULT NULL,
  deleted_at VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_contacts (
  student_id BIGINT NOT NULL,
  contact_id BIGINT NOT NULL,
  relationship VARCHAR(50) DEFAULT NULL,
  is_primary TINYINT(1) DEFAULT 0,
  PRIMARY KEY (student_id, contact_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


CREATE TABLE IF NOT EXISTS student_history (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  no_of_juzus_memorized VARCHAR(50) DEFAULT NULL,
  previous_school VARCHAR(50) DEFAULT NULL,
  previous_school_year VARCHAR(50) DEFAULT NULL,
  previous_class_theology VARCHAR(50) DEFAULT NULL,
  previous_class_secular VARCHAR(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 6) DOCUMENTS
-- =============================
CREATE TABLE IF NOT EXISTS document_types (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(60) NOT NULL UNIQUE,
  label VARCHAR(120) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS documents (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  owner_type VARCHAR(30) NOT NULL,
  owner_id BIGINT NOT NULL,
  document_type_id BIGINT NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  file_url VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) DEFAULT NULL,
  file_size BIGINT DEFAULT NULL,
  issued_by VARCHAR(150) DEFAULT NULL,
  issue_date VARCHAR(255) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  uploaded_by BIGINT DEFAULT NULL,
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 7) ACADEMICS
-- =============================
CREATE TABLE IF NOT EXISTS academic_years (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  name VARCHAR(20) NOT NULL,
  start_date VARCHAR(255) DEFAULT NULL,
  end_date VARCHAR(255) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS terms (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  academic_year_id BIGINT NOT NULL,
  name VARCHAR(20) NOT NULL,
  start_date VARCHAR(255) DEFAULT NULL,
  end_date VARCHAR(255) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'scheduled'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS classes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  name VARCHAR(50) NOT NULL,
  curriculum_id INT DEFAULT NULL,
  class_level INT DEFAULT NULL,
  head_teacher_id BIGINT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS streams (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  name VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS subjects (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(20) DEFAULT NULL,
  subject_type VARCHAR(20) DEFAULT 'core'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS class_subjects (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  class_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  teacher_id BIGINT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS enrollments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  theology_class_id BIGINT DEFAULT NULL,
  stream_id BIGINT DEFAULT NULL,
  academic_year_id BIGINT DEFAULT NULL,
  term_id BIGINT DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_attendance (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  date VARCHAR(255) NOT NULL,
  status ENUM('present', 'absent', 'late', 'excused', 'not_marked') DEFAULT 'not_marked',
  notes TEXT DEFAULT NULL,
  time_in TIME DEFAULT NULL,
  time_out TIME DEFAULT NULL,
  class_id BIGINT DEFAULT NULL,
  method VARCHAR(20) DEFAULT 'manual',
  marked_by BIGINT DEFAULT NULL,
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_student_date (student_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS staff (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  person_id BIGINT NOT NULL,
  staff_no VARCHAR(50) UNIQUE DEFAULT NULL,
  position VARCHAR(100) DEFAULT NULL,
  hire_date VARCHAR(255) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS staff_attendance (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  staff_id BIG INT NOT NULL,
  date VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'present',
  notes TEXT DEFAULT NULL,
  time_in TIME DEFAULT NULL,
  time_out TIME DEFAULT NULL,
  method VARCHAR(20) DEFAULT 'manual',
  marked_by BIGINT DEFAULT NULL,
  marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_staff_date (staff_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS timetable (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  class_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  teacher_id BIGINT DEFAULT NULL,
  day_of_week TINYINT NOT NULL,
  start_time VARCHAR(255) NOT NULL,
  end_time VARCHAR(255) NOT NULL,
  room VARCHAR(50) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'scheduled'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS exams (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  class_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  term_id BIGINT DEFAULT NULL,
  name VARCHAR(120) NOT NULL,
  body VARCHAR(50) DEFAULT NULL,
  date VARCHAR(255) DEFAULT NULL,
  start_time VARCHAR(255) DEFAULT NULL,
  end_time VARCHAR(255) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'scheduled'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS results (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  score DECIMAL(5,2) DEFAULT NULL,
  grade VARCHAR(5) DEFAULT NULL,
  remarks TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- RESULTS & RESULT TYPES EXTENSIONS
CREATE TABLE IF NOT EXISTS result_types (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(60) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  weight DECIMAL(5,2) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at VARCHAR(255) DEFAULT NULL,
  deadline DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS class_results (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  term_id BIGINT DEFAULT NULL,
  academic_year_id BIGINT DEFAULT NULL,
  result_type_id BIGINT NOT NULL,
  score DECIMAL(5,2) DEFAULT NULL,
  grade VARCHAR(10) DEFAULT NULL,
  remarks TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at VARCHAR(255) DEFAULT NULL,
  UNIQUE KEY uq_class_result (student_id,class_id,subject_id,term_id,result_type_id,academic_year_id),
  INDEX idx_academic_year (academic_year_id),
  INDEX idx_student_year (student_id, academic_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS report_cards (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  term_id BIGINT NOT NULL,
  overall_grade VARCHAR(10) DEFAULT NULL,
  class_teacher_comment TEXT DEFAULT NULL,
  headteacher_comment TEXT DEFAULT NULL,
  dos_comment TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS promotions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  student_id BIGINT NOT NULL,
  from_class_id BIGINT NOT NULL,
  to_class_id BIGINT NOT NULL,
  from_academic_year_id BIGINT DEFAULT NULL,
  to_academic_year_id BIGINT DEFAULT NULL,
  promotion_status VARCHAR(50) NOT NULL,
  term_used VARCHAR(100) DEFAULT NULL,
  promotion_reason VARCHAR(100) DEFAULT 'manual',
  criteria_used TEXT DEFAULT NULL,
  promotion_notes TEXT DEFAULT NULL,
  promoted_by BIGINT DEFAULT NULL,
  promoted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_year_promotion (student_id, to_academic_year_id),
  INDEX idx_student_id (student_id),
  INDEX idx_from_to_class (from_class_id, to_class_id),
  INDEX idx_promoted_at (promoted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 8) REQUIREMENTS
-- =============================
CREATE TABLE IF NOT EXISTS requirements_master (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS term_requirements (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  term_id BIGINT NOT NULL,
  requirement_id BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_requirements (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  term_id BIGINT NOT NULL,
  requirement_id BIGINT NOT NULL,
  brought TINYINT(1) DEFAULT 0,
  date_reported DATE DEFAULT NULL,
  notes TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TERM REQUIREMENT MANAGEMENT
CREATE TABLE IF NOT EXISTS term_requirement_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  term_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT DEFAULT NULL,
  mandatory TINYINT(1) DEFAULT 1,
  UNIQUE KEY uq_term_req_item (term_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS term_student_requirement_status (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  term_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  item_id BIGINT NOT NULL,
  brought TINYINT(1) DEFAULT 0,
  notes TEXT DEFAULT NULL,
  UNIQUE KEY uq_term_student_item (term_id, student_id, item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 9) FINANCE
-- =============================
CREATE TABLE IF NOT EXISTS wallets (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  branch_id BIGINT DEFAULT NULL,
  name VARCHAR(80) NOT NULL,
  method VARCHAR(40) NOT NULL,
  currency VARCHAR(10) DEFAULT 'UGX',
  opening_balance DECIMAL(14,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS finance_categories (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  type VARCHAR(20) NOT NULL,
  name VARCHAR(120) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ledger (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  wallet_id BIGINT NOT NULL,
  category_id BIGINT NOT NULL,
  tx_type VARCHAR(10) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  reference VARCHAR(120) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  student_id BIGINT DEFAULT NULL,
  staff_id BIGINT DEFAULT NULL,
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fee_structures (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  class_id BIGINT NOT NULL,
  term_id BIGINT NOT NULL,
  item VARCHAR(120) NOT NULL,
  amount DECIMAL(14,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_fee_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  term_id BIGINT NOT NULL,
  item VARCHAR(120) NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  discount DECIMAL(14,2) DEFAULT 0,
  paid DECIMAL(14,2) DEFAULT 0,
  balance DECIMAL(14,2) GENERATED ALWAYS AS (amount - discount - paid) STORED
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fee_payments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIG INT NOT NULL,
  term_id BIG INT NOT NULL,
  wallet_id BIGINT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  method VARCHAR(30) DEFAULT NULL,
  paid_by VARCHAR(150) DEFAULT NULL,
  payer_contact VARCHAR(50) DEFAULT NULL,
  reference VARCHAR(120) DEFAULT NULL,
  receipt_no VARCHAR(40) DEFAULT NULL,
  ledger_id BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 10) PAYROLL
-- =============================
CREATE TABLE IF NOT EXISTS payroll_definitions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  name VARCHAR(120) NOT NULL,
  type VARCHAR(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS staff_salaries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  staff_id BIGINT NOT NULL,
  month YEAR(4) DEFAULT NULL,
  period_month TINYINT DEFAULT NULL,
  definition_id BIGINT NOT NULL,
  amount DECIMAL(14,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS salary_payments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  staff_id BIGINT NOT NULL,
  wallet_id BIGINT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  method VARCHAR(30) DEFAULT NULL,
  reference VARCHAR(120) DEFAULT NULL,
  ledger_id BIGINT DEFAULT NULL,
  paid_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 11) DEPARTMENTS, WORKPLANS, EVENTS
-- =============================
CREATE TABLE IF NOT EXISTS departments (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  name VARCHAR(120) NOT NULL,
  head_staff_id BIGINT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  budget DECIMAL(14,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS department_workplans (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  department_id BIGINT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  start_datetime DATETIME DEFAULT NULL,
  end_datetime DATETIME DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS workplans (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  owner_type VARCHAR(20) NOT NULL,
  owner_id BIGINT DEFAULT NULL,
  start_datetime DATETIME DEFAULT NULL,
  end_datetime DATETIME DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  priority VARCHAR(20) DEFAULT 'medium',
  progress INT DEFAULT 0,
  assigned_to BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS events (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  location VARCHAR(120) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'upcoming',
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE result_submission_deadlines (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  teacher_id BIGINT DEFAULT NULL,
  deadline DATETIME NOT NULL,
  reminder_days_before INT DEFAULT 2, -- e.g. send reminders 2 days before
  status VARCHAR(20) DEFAULT 'active'
);

CREATE TABLE reminders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIG NOT NULL,
  owner_type VARCHAR(50) NOT NULL,  -- e.g. 'event', 'task', 'exam', 'result_submission'
  owner_id BIGINT NOT NULL,
  message TEXT DEFAULT NULL,
  remind_at DATETIME NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- =============================
-- 12) STORES & INVENTORY
-- =============================
CREATE TABLE stores (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIG NOT NULL,
  name VARCHAR(120) NOT NULL,
  location VARCHAR(150) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE store_items (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  store_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  unit VARCHAR(50) DEFAULT NULL,   -- kg, litres, packets, etc.
  capacity DECIMAL(14,2) DEFAULT NULL, -- max capacity allowed
  reorder_level DECIMAL(14,2) DEFAULT NULL, -- alert threshold
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE store_transactions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  item_id BIGINT NOT NULL,
  tx_type VARCHAR(20) NOT NULL, -- 'in' or 'out'
  quantity DECIMAL(14,2) NOT NULL,
  reference VARCHAR(120) DEFAULT NULL,
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================
-- 13) SETTINGS
-- =============================
CREATE TABLE IF NOT EXISTS school_settings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  key_name VARCHAR(120) NOT NULL,
  value_text TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 14) SEEDS (Document Types minimal)
-- =============================
INSERT INTO document_types (code, label) VALUES
  ('national_id','National ID'),
  ('passport_photo','Passport Photo'),
  ('full_photo','Full Photo'),
  ('imam_priest_letter','Letter from Imam/Priest'),
  ('county_kadhi_reverend_letter','Letter from County Kadhi/Reverend'),
  ('lci_letter','Letter from LCI'),
  ('gso_letter','Letter from GISO/GSO'),
  ('birth_certificate','Birth Certificate'),
  ('transfer_letter','Transfer Letter'),
  ('other','Other')
ON DUPLICATE KEY UPDATE label=VALUES(label);

-- =============================
-- 15) STUDENT EXTENDED INFORMATION (Normalized)
-- =============================
CREATE TABLE IF NOT EXISTS living_statuses (
  id TINYINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL UNIQUE,
  label VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS orphan_statuses (
  id TINYINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL UNIQUE,
  label VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS nationalities (
  id INT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(3) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_profiles (
  student_id BIGINT PRIMARY KEY,
  place_of_birth VARCHAR(150) DEFAULT NULL,
  place_of_residence VARCHAR(150) DEFAULT NULL,
  district_id BIGINT DEFAULT NULL,
  nationality_id INT DEFAULT NULL,
  passport_document_id BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_family_status (
  student_id BIGINT PRIMARY KEY,
  orphan_status_id TINYINT DEFAULT NULL,
  primary_guardian_name VARCHAR(150) DEFAULT NULL,
  primary_guardian_contact VARCHAR(60) DEFAULT NULL,
  primary_guardian_occupation VARCHAR(120) DEFAULT NULL,
  father_name VARCHAR(150) DEFAULT NULL,
  father_living_status_id TINYINT DEFAULT NULL,
  father_occupation VARCHAR(120) DEFAULT NULL,
  father_contact VARCHAR(60) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  updated_at VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_next_of_kin (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  sequence TINYINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255) DEFAULT NULL,
  occupation VARCHAR(120) DEFAULT NULL,
  contact VARCHAR(60) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_education_levels (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  education_type VARCHAR(20) NOT NULL,
  level_name VARCHAR(120) NOT NULL,
  institution VARCHAR(150) DEFAULT NULL,
  year_completed YEAR DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_hafz_progress_summary (
  student_id BIGINT PRIMARY KEY,
  juz_memorized INT DEFAULT 0,
  updated_at VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS curriculums (
  id TINYINT PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS student_curriculums (
  student_id BIGINT NOT NULL,
  curriculum_id TINYINT NOT NULL,
  active TINYINT(1) DEFAULT 1,
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (student_id, curriculum_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 16) REPORT CARD ENHANCEMENTS
-- =============================
CREATE TABLE IF NOT EXISTS report_card_metrics (
  report_card_id BIGINT PRIMARY KEY,
  total_score DECIMAL(7,2) DEFAULT NULL,
  average_score DECIMAL(5,2) DEFAULT NULL,
  min_score DECIMAL(5,2) DEFAULT NULL,
  max_score DECIMAL(5,2) DEFAULT NULL,
  position INT DEFAULT NULL,
  promoted TINYINT(1) DEFAULT 0,
  promotion_class_id BIGINT DEFAULT NULL,
  computed_at VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS class_results (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  term_id BIGINT DEFAULT NULL,
  result_type_id BIGINT NOT NULL,
  score DECIMAL(5,2) DEFAULT NULL,
  grade VARCHAR(10) DEFAULT NULL,
  remarks TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at VARCHAR(255) DEFAULT NULL,
  UNIQUE KEY uq_class_result (student_id,class_id,subject_id,term_id,result_type_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 17) TERM TRACKING EXTENSIONS
-- =============================
CREATE TABLE IF NOT EXISTS term_student_reports (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  term_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  report_date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'reported',
  notes TEXT DEFAULT NULL,
  UNIQUE KEY uq_term_student (term_id, student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS term_progress_log (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  term_id BIGINT NOT NULL,
  day_date DATE NOT NULL,
  week_no TINYINT DEFAULT NULL,
  summary VARCHAR(200) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  UNIQUE KEY uq_term_day (term_id, day_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================
-- 18) SEEDS FOR NEW REFERENCE TABLES
-- =============================
INSERT INTO living_statuses (code, label) VALUES
  ('alive','Alive'),
  ('deceased','Deceased')
ON DUPLICATE KEY UPDATE label=VALUES(label);

INSERT INTO orphan_statuses (code, label) VALUES
  ('orphan','Orphan'),
  ('non_orphan','Non-Orphan')
ON DUPLICATE KEY UPDATE label=VALUES(label);

INSERT INTO curriculums (code, name) VALUES
  ('secular','Secular Curriculum'),
  ('theology','Theology Curriculum')
ON DUPLICATE KEY UPDATE name=VALUES(name);

INSERT INTO nationalities (code, name) VALUES
  ('UGA','Uganda')
ON DUPLICATE KEY UPDATE name=VALUES(name);

-- Modify the `student_attendance` table to ensure real-time attendance tracking.
ALTER TABLE student_attendance
MODIFY COLUMN status ENUM('present', 'absent', 'late', 'excused', 'not_marked') DEFAULT 'not_marked';

-- Create a view to join `students`, `people`, and `enrollments` for attendance.
CREATE OR REPLACE VIEW student_attendance_view AS
SELECT
  s.id AS student_id,
  p.first_name,
  p.last_name,
  e.class_id,
  sa.date,
  sa.time_in,
  sa.time_out,
  sa.status
FROM students s
JOIN people p ON s.person_id = p.id
JOIN enrollments e ON s.id = e.student_id
LEFT JOIN student_attendance sa ON s.id = sa.student_id
WHERE e.status = 'active';

CREATE TABLE IF NOT EXISTS reminder_schedule (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  deadline_id BIGINT NOT NULL,
  reminder_time TIME NOT NULL, -- Time of the day for reminders (e.g., 08:00:00, 12:00:00, 17:00:00)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Add default reminder times for each deadline
INSERT INTO reminder_schedule (deadline_id, reminder_time)
SELECT id, '08:00:00' FROM result_submission_deadlines
ON DUPLICATE KEY UPDATE reminder_time = VALUES(reminder_time);

INSERT INTO reminder_schedule (deadline_id, reminder_time)
SELECT id, '12:00:00' FROM result_submission_deadlines
ON DUPLICATE KEY UPDATE reminder_time = VALUES(reminder_time);

INSERT INTO reminder_schedule (deadline_id, reminder_time)
SELECT id, '17:00:00' FROM result_submission_deadlines
ON DUPLICATE KEY UPDATE reminder_time = VALUES(reminder_time);

ALTER TABLE result_types
ADD COLUMN deadline DATETIME DEFAULT NULL AFTER updated_at;

CREATE TABLE IF NOT EXISTS fingerprints (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  method VARCHAR(50) NOT NULL, -- 'phone' or 'biometric'
  credential TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

-- Upgrade student_attendance table to support hybrid tracking
ALTER TABLE student_attendance 
ADD COLUMN IF NOT EXISTS method VARCHAR(20) DEFAULT 'manual' AFTER status,
ADD COLUMN IF NOT EXISTS marked_by BIGINT DEFAULT NULL AFTER method,
ADD COLUMN IF NOT EXISTS marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER marked_by,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER marked_at;

-- Ensure unique constraint exists
ALTER TABLE student_attendance 
ADD UNIQUE KEY IF NOT EXISTS unique_student_date (student_id, date);

-- Add is_late computed column if not exists
ALTER TABLE student_attendance 
ADD COLUMN IF NOT EXISTS is_late BOOLEAN GENERATED ALWAYS AS (
  CASE 
    WHEN time_in > '08:30:00' AND status = 'present' THEN TRUE 
    ELSE FALSE 
  END
) STORED;

-- Enhanced staff_attendance table for better tracking
ALTER TABLE staff_attendance 
ADD COLUMN IF NOT EXISTS time_in TIME DEFAULT NULL AFTER status,
ADD COLUMN IF NOT EXISTS time_out TIME DEFAULT NULL AFTER time_in,
ADD COLUMN IF NOT EXISTS method VARCHAR(20) DEFAULT 'manual' AFTER time_out,
ADD COLUMN IF NOT EXISTS marked_by BIGINT DEFAULT NULL AFTER method,
ADD COLUMN IF NOT EXISTS marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER marked_by,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER marked_at,
ADD UNIQUE KEY IF NOT EXISTS unique_staff_date (staff_id, date);

-- Enhanced departments table
ALTER TABLE departments 
ADD COLUMN IF NOT EXISTS budget DECIMAL(14,2) DEFAULT 0 AFTER description,
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER budget,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;

-- Enhanced workplans table with better tracking
ALTER TABLE workplans 
ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'medium' AFTER status,
ADD COLUMN IF NOT EXISTS progress INT DEFAULT 0 AFTER priority,
ADD COLUMN IF NOT EXISTS assigned_to BIGINT DEFAULT NULL AFTER progress,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;

-- Staff performance tracking
CREATE TABLE IF NOT EXISTS staff_performance_summary (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  staff_id BIGINT NOT NULL,
  term_id BIGINT DEFAULT NULL,
  attendance_percentage DECIMAL(5,2) DEFAULT 0,
  tasks_completed INT DEFAULT 0,
  tasks_assigned INT DEFAULT 0,
  performance_rating DECIMAL(3,1) DEFAULT 0,
  last_evaluation_date DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_staff_term (school_id, staff_id, term_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Work plan templates for recurring tasks
CREATE TABLE IF NOT EXISTS workplan_templates (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  department_id BIGINT DEFAULT NULL,
  duration_days INT DEFAULT 1,
  priority VARCHAR(20) DEFAULT 'medium',
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Performance indexes for staff operations
CREATE INDEX IF NOT EXISTS idx_staff_school_status ON staff(school_id, status);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance(date, staff_id);
CREATE INDEX IF NOT EXISTS idx_departments_school ON departments(school_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_workplans_school_status ON workplans(school_id, status);
CREATE INDEX IF NOT EXISTS idx_workplans_assigned ON workplans(assigned_to, status);

-- Ensure requirements_master table has proper constraints
ALTER TABLE requirements_master 
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER description,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at;

-- Enhanced student_requirements table with class and term associations
ALTER TABLE student_requirements 
ADD COLUMN IF NOT EXISTS class_id BIGINT DEFAULT NULL AFTER term_id,
ADD COLUMN IF NOT EXISTS requirement_item VARCHAR(255) DEFAULT NULL AFTER requirement_id,
ADD COLUMN IF NOT EXISTS quantity VARCHAR(50) DEFAULT NULL AFTER requirement_item,
MODIFY COLUMN notes TEXT DEFAULT NULL;

-- Create class_requirements table for class-level requirement definitions
CREATE TABLE IF NOT EXISTS class_requirements (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  term_id BIGINT NOT NULL,
  requirement_item VARCHAR(255) NOT NULL,
  description TEXT DEFAULT NULL,
  quantity VARCHAR(50) DEFAULT NULL,
  is_mandatory TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  UNIQUE KEY unique_class_term_item (class_id, term_id, requirement_item)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_class_requirements_class_term ON class_requirements(class_id, term_id);
CREATE INDEX IF NOT EXISTS idx_student_requirements_class ON student_requirements(class_id, term_id);
-- =============================
-- 20) EXAM TYPES & QUESTION BANKS

CREATE TABLE IF NOT EXISTS exam_types (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT DEFAULT NULL,
  name VARCHAR(120) NOT NULL,       -- e.g. Homework, Test, Midterm, Final, Quiz
  description TEXT DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS question_banks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  teacher_id BIGINT DEFAULT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  difficulty ENUM('easy','medium','hard') DEFAULT 'medium',
  visibility ENUM('private','shared') DEFAULT 'private',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS questions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  bank_id BIGINT DEFAULT NULL,
  exam_id BIGINT DEFAULT NULL,
  question_text TEXT NOT NULL,
  question_type ENUM('multiple_choice','true_false','short_answer','essay','file_upload') DEFAULT 'multiple_choice',
  marks DECIMAL(5,2) DEFAULT 1,
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
 
 CREATE TABLE IF NOT EXISTS question_options (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  question_id BIGINT NOT NULL,
  option_label VARCHAR(5) DEFAULT NULL,   -- e.g. A, B, C
  option_text TEXT NOT NULL,
  is_correct TINYINT(1) DEFAULT 0
);

CREATE TABLE IF NOT EXISTS student_submissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  question_id BIGINT DEFAULT NULL,
  student_id BIGINT NOT NULL,
  answer_text TEXT DEFAULT NULL,
  selected_option_id BIGINT DEFAULT NULL,
  file_url VARCHAR(255) DEFAULT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  score DECIMAL(5,2) DEFAULT NULL,
  marked_by BIGINT DEFAULT NULL,
  marked_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS exam_settings (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  type_id BIGINT DEFAULT NULL,
  total_marks DECIMAL(6,2) DEFAULT NULL,
  duration_minutes INT DEFAULT NULL,
  randomize_questions TINYINT(1) DEFAULT 0,
  allow_retake TINYINT(1) DEFAULT 0,
  start_datetime DATETIME DEFAULT NULL,
  end_datetime DATETIME DEFAULT NULL,
  mode ENUM('online','offline') DEFAULT 'offline',
  visibility ENUM('public','private') DEFAULT 'public'
);

CREATE TABLE IF NOT EXISTS homeworks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  teacher_id BIGINT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  due_date DATETIME DEFAULT NULL,
  attachment_url VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS homework_submissions (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  homework_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  file_url VARCHAR(255) DEFAULT NULL,
  text_answer TEXT DEFAULT NULL,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  marked_by BIGINT DEFAULT NULL,
  score DECIMAL(5,2) DEFAULT NULL,
  feedback TEXT DEFAULT NULL
);
-- =============================
-- 21) BIOMETRIC ATTENDANCE INTEGRATION 
-- Create student_fingerprints table for demo purposes
CREATE TABLE IF NOT EXISTS student_fingerprints (
    id INT AUTO_INCREMENT PRIMARY KEY,
    student_id INT NOT NULL,
    fingerprint_data TEXT NOT NULL,
    device_info JSON NULL,
    quality_score INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    
    FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
    INDEX idx_student_id (student_id),
    INDEX idx_created_at (created_at)
);

-- Update existing fingerprints table if needed
ALTER TABLE fingerprints 
ADD COLUMN IF NOT EXISTS device_info JSON NULL,
ADD COLUMN IF NOT EXISTS quality_score INT DEFAULT 0;
ALTER TABLE fingerprints 
ADD INDEX IF NOT EXISTS idx_created_at (created_at);

-- Upgrade student_attendance table to support hybrid tracking
ALTER TABLE student_attendance 
-- ADD COLUMN method VARCHAR(20) DEFAULT 'manual' AFTER status,
ADD COLUMN marked_by BIGINT DEFAULT NULL AFTER method,
ADD COLUMN marked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP AFTER marked_by,
ADD UNIQUE KEY unique_student_date (student_id, date);

-- Update status values to be more specific
ALTER TABLE student_attendance 
MODIFY COLUMN status ENUM('present', 'absent', 'late', 'excused', 'not_marked') DEFAULT 'not_marked';

-- Create student_fingerprints table for biometric data
CREATE TABLE IF NOT EXISTS student_fingerprints (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL UNIQUE,
  method VARCHAR(50) NOT NULL DEFAULT 'passkey',
  credential_id VARCHAR(255) NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT DEFAULT 0,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at VARCHAR DEFAULT NULL,
  INDEX idx_student (student_id),
  INDEX idx_credential (credential_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
