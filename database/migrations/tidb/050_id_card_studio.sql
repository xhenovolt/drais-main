-- 050 - ID Card Studio: two-sided designs + isolated Excel card jobs.
--
-- id_card_designs   : per-school two-sided card designs (spec_json, mm-based).
--                     Additive; legacy id_card_templates is untouched and keeps working.
-- id_card_jobs      : short-lived, per-school, per-user Excel card jobs. The uploaded
--                     workbook bytes live here (never on a public URL) and are purged
--                     at expires_at or on explicit delete. NOTHING here is a student row;
--                     generating cards from a job never writes to students/people/
--                     enrollments and never triggers attendance or SMS.
--
-- ROLLBACK (reversible; both tables are new and hold no data other code depends on):
--   DROP TABLE IF EXISTS id_card_jobs;
--   DROP TABLE IF EXISTS id_card_designs;

CREATE TABLE IF NOT EXISTS id_card_designs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id BIGINT NOT NULL,
  name VARCHAR(160) NOT NULL,
  spec_json LONGTEXT NOT NULL,
  source_kind VARCHAR(24) NOT NULL DEFAULT 'designed',
  is_active TINYINT(1) NOT NULL DEFAULT 0,
  created_by BIGINT DEFAULT NULL,
  updated_by BIGINT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP NULL DEFAULT NULL,
  KEY idx_card_design_school (school_id, deleted_at, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS id_card_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  job_uuid CHAR(36) NOT NULL,
  school_id BIGINT NOT NULL,
  created_by BIGINT NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'uploaded',
  file_name VARCHAR(255) NOT NULL,
  file_size INT NOT NULL,
  file_sha256 CHAR(64) NOT NULL,
  file_data LONGBLOB DEFAULT NULL,
  sheet_name VARCHAR(255) DEFAULT NULL,
  header_row INT NOT NULL DEFAULT 1,
  mapping_json TEXT DEFAULT NULL,
  row_count INT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  deleted_at DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_card_job_uuid (job_uuid),
  KEY idx_card_job_owner (school_id, created_by, status),
  KEY idx_card_job_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
