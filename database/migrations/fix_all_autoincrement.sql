-- ============================================================
-- FIX ALL TABLES: Add PRIMARY KEY + AUTO_INCREMENT + AUTO_ID_CACHE 1
-- TiDB cannot ALTER TABLE to add AUTO_INCREMENT, so we must DROP/RECREATE
-- Run: March 2026
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;

-- ========== EMPTY TABLES (safe to DROP/RECREATE) ==========

DROP TABLE IF EXISTS academic_years;
CREATE TABLE academic_years (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  name VARCHAR(20) NOT NULL,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS audit_log;
CREATE TABLE audit_log (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  actor_user_id BIGINT DEFAULT NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id BIGINT DEFAULT NULL,
  changes_json LONGTEXT DEFAULT NULL,
  ip VARCHAR(64) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS branches;
CREATE TABLE branches (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS class_results;
CREATE TABLE class_results (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  term_id BIGINT DEFAULT NULL,
  result_type_id BIGINT NOT NULL,
  score DECIMAL(5,2) DEFAULT NULL,
  grade VARCHAR(10) DEFAULT NULL,
  remarks TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS class_subjects;
CREATE TABLE class_subjects (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  class_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  teacher_id BIGINT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS counties;
CREATE TABLE counties (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  district_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS department_workplans;
CREATE TABLE department_workplans (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  department_id BIGINT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  start_datetime DATETIME DEFAULT NULL,
  end_datetime DATETIME DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'pending',
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS departments;
CREATE TABLE departments (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  head_staff_id BIGINT DEFAULT NULL,
  description TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS districts;
CREATE TABLE districts (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS document_types;
CREATE TABLE document_types (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(60) NOT NULL,
  label VARCHAR(120) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS documents;
CREATE TABLE documents (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  owner_type VARCHAR(30) NOT NULL,
  owner_id BIGINT NOT NULL,
  document_type_id BIGINT NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  file_url VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) DEFAULT NULL,
  file_size BIGINT DEFAULT NULL,
  issued_by VARCHAR(150) DEFAULT NULL,
  issue_date DATE DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  uploaded_by BIGINT DEFAULT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS events;
CREATE TABLE events (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  title VARCHAR(200) NOT NULL,
  description TEXT DEFAULT NULL,
  start_datetime DATETIME NOT NULL,
  end_datetime DATETIME NOT NULL,
  location VARCHAR(120) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'upcoming',
  created_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS exams;
CREATE TABLE exams (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  term_id BIGINT DEFAULT NULL,
  name VARCHAR(120) NOT NULL,
  body VARCHAR(50) DEFAULT NULL,
  date DATE DEFAULT NULL,
  start_time TIME DEFAULT NULL,
  end_time TIME DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'scheduled'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS fee_payments;
CREATE TABLE fee_payments (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  fee_item_id BIGINT DEFAULT NULL,
  term_id BIGINT NOT NULL,
  multi_term_ids JSON DEFAULT NULL,
  wallet_id BIGINT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  method VARCHAR(30) DEFAULT NULL,
  discount_type ENUM('percentage','fixed') DEFAULT NULL,
  discount_reason TEXT DEFAULT NULL,
  approved_by BIGINT DEFAULT NULL,
  approved_at TIMESTAMP NULL DEFAULT NULL,
  receipt_url VARCHAR(255) DEFAULT NULL,
  invoice_url VARCHAR(255) DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  paid_by VARCHAR(150) DEFAULT NULL,
  payer_contact VARCHAR(50) DEFAULT NULL,
  reference VARCHAR(120) DEFAULT NULL,
  receipt_no VARCHAR(40) DEFAULT NULL,
  payment_status ENUM('pending','completed','failed','refunded') DEFAULT 'completed',
  gateway_reference VARCHAR(255) DEFAULT NULL,
  gateway_response JSON DEFAULT NULL,
  mpesa_receipt VARCHAR(100) DEFAULT NULL,
  phone_number VARCHAR(20) DEFAULT NULL,
  ledger_id BIGINT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  discount_applied DECIMAL(14,2) DEFAULT '0',
  tax_amount DECIMAL(14,2) DEFAULT '0',
  KEY idx_fp_student (student_id),
  KEY idx_fp_status (payment_status),
  KEY idx_fp_date (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS fee_structures;
CREATE TABLE fee_structures (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  class_id BIGINT NOT NULL,
  section_id BIGINT DEFAULT NULL,
  term_id BIGINT NOT NULL,
  academic_year VARCHAR(9) DEFAULT NULL,
  item VARCHAR(120) NOT NULL,
  fee_type ENUM('tuition','uniform','transport','boarding','examination','activity','books','other') DEFAULT 'tuition',
  is_mandatory TINYINT(1) DEFAULT '1',
  amount DECIMAL(14,2) NOT NULL,
  description TEXT DEFAULT NULL,
  due_date DATE DEFAULT NULL,
  late_fee_amount DECIMAL(14,2) DEFAULT '0.00',
  is_active TINYINT(1) DEFAULT '1',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_fs_class (class_id),
  KEY idx_fs_year (academic_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS finance_categories;
CREATE TABLE finance_categories (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  type VARCHAR(20) NOT NULL,
  category_type ENUM('income','expense','transfer') DEFAULT 'income',
  parent_id BIGINT DEFAULT NULL,
  is_system TINYINT(1) DEFAULT '0',
  color VARCHAR(20) DEFAULT '#3B82F6',
  icon VARCHAR(50) DEFAULT 'DollarSign',
  is_active TINYINT(1) DEFAULT '1',
  name VARCHAR(120) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS ledger;
CREATE TABLE ledger (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
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
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

-- Lookup tables — keep small int types
DROP TABLE IF EXISTS living_statuses;
CREATE TABLE living_statuses (
  id TINYINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL,
  label VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS nationalities;
CREATE TABLE nationalities (
  id INT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(3) NOT NULL,
  name VARCHAR(100) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS orphan_statuses;
CREATE TABLE orphan_statuses (
  id TINYINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(20) NOT NULL,
  label VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS parishes;
CREATE TABLE parishes (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  subcounty_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS payroll_definitions;
CREATE TABLE payroll_definitions (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  type VARCHAR(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS report_card_subjects;
CREATE TABLE report_card_subjects (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  report_card_id BIGINT NOT NULL,
  subject_id BIGINT NOT NULL,
  total_score DECIMAL(5,2) DEFAULT NULL,
  grade VARCHAR(10) DEFAULT NULL,
  remarks TEXT DEFAULT NULL,
  position INT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS report_cards;
CREATE TABLE report_cards (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  term_id BIGINT NOT NULL,
  overall_grade VARCHAR(10) DEFAULT NULL,
  class_teacher_comment TEXT DEFAULT NULL,
  headteacher_comment TEXT DEFAULT NULL,
  dos_comment TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS requirements_master;
CREATE TABLE requirements_master (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS result_types;
CREATE TABLE result_types (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  name VARCHAR(120) NOT NULL,
  code VARCHAR(60) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  weight DECIMAL(5,2) DEFAULT NULL,
  deadline VARCHAR(255) DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS results;
CREATE TABLE results (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  exam_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  score DECIMAL(5,2) DEFAULT NULL,
  grade VARCHAR(5) DEFAULT NULL,
  remarks TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS salary_payments;
CREATE TABLE salary_payments (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  staff_id BIGINT NOT NULL,
  wallet_id BIGINT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  method VARCHAR(30) DEFAULT NULL,
  reference VARCHAR(120) DEFAULT NULL,
  ledger_id BIGINT DEFAULT NULL,
  paid_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS school_settings;
CREATE TABLE school_settings (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  key_name VARCHAR(120) NOT NULL,
  value_text TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS staff_attendance;
CREATE TABLE staff_attendance (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  staff_id BIGINT NOT NULL,
  date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'present',
  notes TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS staff_salaries;
CREATE TABLE staff_salaries (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  staff_id BIGINT NOT NULL,
  month YEAR(4) DEFAULT NULL,
  period_month TINYINT DEFAULT NULL,
  definition_id BIGINT NOT NULL,
  amount DECIMAL(14,2) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS student_attendance;
CREATE TABLE student_attendance (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  date DATE NOT NULL,
  status VARCHAR(20) DEFAULT 'present',
  method VARCHAR(50) DEFAULT 'manual',
  time_in TIME DEFAULT NULL,
  time_out TIME DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  marked_at TIMESTAMP NULL DEFAULT NULL,
  marked_by INT DEFAULT NULL,
  attendance_session_id BIGINT DEFAULT NULL COMMENT 'Link to attendance session',
  term_id BIGINT DEFAULT NULL COMMENT 'Academic term',
  academic_year_id BIGINT DEFAULT NULL COMMENT 'Academic year',
  stream_id BIGINT DEFAULT NULL COMMENT 'Student stream/section',
  subject_id BIGINT DEFAULT NULL COMMENT 'Subject (if applicable)',
  teacher_id BIGINT DEFAULT NULL COMMENT 'Teacher who took attendance',
  device_id BIGINT DEFAULT NULL COMMENT 'Biometric device ID',
  biometric_timestamp TIMESTAMP NULL DEFAULT NULL COMMENT 'Biometric capture timestamp',
  confidence_score DECIMAL(5,2) DEFAULT NULL COMMENT 'Biometric confidence score',
  override_reason TEXT DEFAULT NULL COMMENT 'Reason for admin override',
  is_locked TINYINT(1) DEFAULT '0' COMMENT 'Attendance locked status',
  locked_at TIMESTAMP NULL DEFAULT NULL COMMENT 'When attendance was locked',
  KEY idx_session (attendance_session_id),
  KEY idx_device (device_id),
  KEY idx_is_locked (is_locked),
  KEY idx_biometric_timestamp (biometric_timestamp),
  KEY idx_stream (stream_id),
  KEY idx_teacher (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS student_education_levels;
CREATE TABLE student_education_levels (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  education_type VARCHAR(20) NOT NULL,
  level_name VARCHAR(120) NOT NULL,
  institution VARCHAR(150) DEFAULT NULL,
  year_completed YEAR(4) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS student_next_of_kin;
CREATE TABLE student_next_of_kin (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  sequence TINYINT NOT NULL,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255) DEFAULT NULL,
  occupation VARCHAR(120) DEFAULT NULL,
  contact VARCHAR(60) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS student_requirements;
CREATE TABLE student_requirements (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  student_id BIGINT NOT NULL,
  term_id BIGINT NOT NULL,
  requirement_id BIGINT NOT NULL,
  brought TINYINT(1) DEFAULT '0',
  date_reported DATE DEFAULT NULL,
  notes TEXT DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS subcounties;
CREATE TABLE subcounties (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  county_id BIGINT NOT NULL,
  name VARCHAR(150) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS tahfiz_attendance;
CREATE TABLE tahfiz_attendance (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  student_id BIGINT NOT NULL,
  group_id BIGINT NOT NULL,
  date DATE NOT NULL,
  status ENUM('present','absent','late','excused') DEFAULT 'present',
  remarks TEXT DEFAULT NULL,
  recorded_by BIGINT DEFAULT NULL,
  recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

DROP TABLE IF EXISTS tahfiz_books;
CREATE TABLE tahfiz_books (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  school_id BIGINT NOT NULL,
  title VARCHAR(100) NOT NULL,
  description TEXT DEFAULT NULL,
  total_units INT DEFAULT NULL,
  unit_type VARCHAR(50) DEFAULT 'verse',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

-- ========== TABLES WITH DATA (migrate carefully) ==========

-- SCHOOLS table (6 rows, has PK already)
DROP TABLE IF EXISTS _schools_new;
CREATE TABLE _schools_new (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  legal_name VARCHAR(200) DEFAULT NULL,
  short_code VARCHAR(50) DEFAULT NULL,
  email VARCHAR(150) DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  currency VARCHAR(10) DEFAULT 'UGX',
  address TEXT DEFAULT NULL,
  logo_url VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NULL DEFAULT NULL,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  status VARCHAR(20) DEFAULT 'active',
  setup_complete TINYINT(1) DEFAULT '1',
  school_type VARCHAR(50) DEFAULT 'secondary',
  motto VARCHAR(255) DEFAULT NULL,
  district VARCHAR(100) DEFAULT NULL,
  website VARCHAR(255) DEFAULT NULL,
  founded_year INT DEFAULT NULL,
  country VARCHAR(100) DEFAULT 'Uganda',
  region VARCHAR(100) DEFAULT NULL,
  principal_name VARCHAR(200) DEFAULT NULL,
  principal_phone VARCHAR(30) DEFAULT NULL,
  registration_number VARCHAR(100) DEFAULT NULL,
  po_box VARCHAR(100) DEFAULT NULL,
  center_no VARCHAR(100) DEFAULT NULL,
  arabic_name VARCHAR(255) DEFAULT NULL,
  arabic_address VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

INSERT INTO _schools_new (id, name, legal_name, short_code, email, phone, currency, address, logo_url, created_at, updated_at, deleted_at, status, setup_complete, school_type, motto, district, website, founded_year, country, region, principal_name, principal_phone, registration_number, po_box, center_no, arabic_name, arabic_address)
  SELECT id, name, legal_name, short_code, email, phone, currency, address, logo_url, created_at, updated_at, deleted_at, status, setup_complete, school_type, motto, district, website, founded_year, country, region, principal_name, principal_phone, registration_number, po_box, center_no, arabic_name, arabic_address FROM schools;

DROP TABLE schools;
ALTER TABLE _schools_new RENAME TO schools;

-- Set AUTO_INCREMENT to max(id)+1 = 7
ALTER TABLE schools AUTO_INCREMENT = 7;

-- PERMISSIONS table (1 row with id=0, has PK already)
DROP TABLE IF EXISTS _permissions_new;
CREATE TABLE _permissions_new (
  id BIGINT NOT NULL PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(120) NOT NULL,
  description TEXT DEFAULT NULL,
  is_active TINYINT(1) DEFAULT '1'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1;

INSERT INTO _permissions_new (id, code, description, is_active)
  SELECT id, code, description, is_active FROM permissions;

DROP TABLE permissions;
ALTER TABLE _permissions_new RENAME TO permissions;

SET FOREIGN_KEY_CHECKS = 1;

-- ========== VERIFICATION ==========
SELECT 'VERIFICATION' AS stage;
SELECT TABLE_NAME, AUTO_INCREMENT
FROM information_schema.tables
WHERE TABLE_SCHEMA = 'drais'
  AND TABLE_NAME IN (
    'academic_years','audit_log','branches','class_results','class_subjects',
    'classes','counties','department_workplans','departments','districts',
    'document_types','documents','events','exams','fee_payments','fee_structures',
    'finance_categories','ledger','living_statuses','nationalities','orphan_statuses',
    'parishes','payroll_definitions','permissions','report_card_subjects','report_cards',
    'requirements_master','result_types','results','salary_payments','school_settings',
    'schools','staff_attendance','staff_salaries','streams','student_attendance',
    'student_education_levels','student_next_of_kin','student_requirements',
    'subcounties','subjects','tahfiz_attendance','tahfiz_books'
  )
ORDER BY TABLE_NAME;
