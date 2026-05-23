-- ============================================================================
-- Phase H — Staff qualifications + subject specialisations
--
-- staff_qualifications: academic credentials, certificates, professional
-- development records attached to a staff member.
--
-- staff_subject_specializations: advisory mapping of which subjects a teacher
-- is qualified/certified to teach. Does NOT enforce allocation — it is used
-- by the allocation UI to surface a warning when assigning a non-specialised
-- teacher, and by the workload panel to show the teacher's competency profile.
--
-- Rollback:
--   DROP TABLE staff_subject_specializations;
--   DROP TABLE staff_qualifications;
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_qualifications (
  id              BIGINT       NOT NULL AUTO_INCREMENT,
  staff_id        BIGINT       NOT NULL,
  school_id       BIGINT       NOT NULL,
  degree_type     VARCHAR(80)  NOT NULL,  -- e.g. "Bachelor of Education", "Diploma", "Certificate"
  institution     VARCHAR(200) NOT NULL,
  field_of_study  VARCHAR(200) NULL,
  year_obtained   SMALLINT     NULL,
  document_url    VARCHAR(500) NULL,
  notes           TEXT         NULL,
  created_by      BIGINT       NOT NULL,
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_sq_staff  (staff_id, school_id),
  KEY idx_sq_school (school_id),
  CONSTRAINT fk_sq_staff FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS staff_subject_specializations (
  id         BIGINT      NOT NULL AUTO_INCREMENT,
  staff_id   BIGINT      NOT NULL,
  subject_id BIGINT      NOT NULL,
  school_id  BIGINT      NOT NULL,
  /** True = formally certified; False = self-declared competency. */
  certified  TINYINT(1)  NOT NULL DEFAULT 0,
  notes      VARCHAR(500) NULL,
  created_by BIGINT       NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_staff_subject (staff_id, subject_id),
  KEY idx_sss_school (school_id),
  CONSTRAINT fk_sss_staff   FOREIGN KEY (staff_id)   REFERENCES staff(id)    ON DELETE CASCADE,
  CONSTRAINT fk_sss_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
