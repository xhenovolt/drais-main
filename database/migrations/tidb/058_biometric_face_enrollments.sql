-- Face enrolment tracking.
--
-- One row per (enrolment, device): "a face enrolment was requested" and "a face template reached DRAIS".
-- Only METADATA is kept (when, which device, size) — the face template bytes are not stored, so a face
-- can never be mistaken for a fingerprint (biometric_templates stays fingers-only) and DRAIS holds no
-- face images or templates it does not need.
CREATE TABLE IF NOT EXISTS biometric_face_enrollments (
  id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id     BIGINT NOT NULL,
  enrollment_id BIGINT NOT NULL,
  device_sn     VARCHAR(64) NOT NULL,
  requested_at  DATETIME DEFAULT NULL,
  command_id    BIGINT DEFAULT NULL,
  captured_at   DATETIME DEFAULT NULL,
  template_size INT DEFAULT NULL,
  bio_type      VARCHAR(4) DEFAULT NULL,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_face_enrollment_device (enrollment_id, device_sn),
  KEY idx_face_school (school_id, captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
