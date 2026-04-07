-- ============================================================================
-- DRAIS Biometric Enrollment Pipeline
-- State machine: INITIATED → CAPTURED → UNASSIGNED → ASSIGNED → VERIFIED
--                                      ↘ ORPHANED
-- ============================================================================

-- enrollment_sessions: one per admin "Enroll" click
CREATE TABLE IF NOT EXISTS enrollment_sessions (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_id     INT NOT NULL,
  device_sn     VARCHAR(64) NOT NULL,
  initiated_by  INT NOT NULL,            -- users.id of the admin who clicked
  student_id    INT NULL,                -- who we intend to enroll (pre-filled)
  status        ENUM('ACTIVE','COMPLETED','FAILED','EXPIRED') NOT NULL DEFAULT 'ACTIVE',
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at    DATETIME NOT NULL,       -- ACTIVE sessions expire after 10 min
  completed_at  DATETIME NULL,
  INDEX idx_es_school_device (school_id, device_sn),
  INDEX idx_es_status (status),
  INDEX idx_es_expires (expires_at)
) ENGINE=InnoDB;

-- biometric_enrollments: one per fingerprint slot on any device
CREATE TABLE IF NOT EXISTS biometric_enrollments (
  id              BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_id       INT NOT NULL,
  device_sn       VARCHAR(64) NOT NULL,
  device_slot     INT UNSIGNED NOT NULL,   -- the ZK uid (slot 1, 2, 3…)
  student_id      INT NULL,                -- NULL until assigned
  staff_id        INT NULL,
  status          ENUM('INITIATED','CAPTURED','UNASSIGNED','ASSIGNED','VERIFIED','ORPHANED')
                  NOT NULL DEFAULT 'INITIATED',
  source          ENUM('local','relay','adms') NOT NULL DEFAULT 'local',
  session_id      BIGINT UNSIGNED NULL,    -- FK to enrollment_sessions
  finger_index    TINYINT UNSIGNED NULL,   -- 0-9 ZK finger slot
  initiated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  captured_at     DATETIME NULL,           -- when device confirmed fingerprint
  assigned_at     DATETIME NULL,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Uniqueness: one row per (device, slot)
  UNIQUE KEY uq_device_slot (device_sn, device_slot),
  INDEX idx_be_school (school_id),
  INDEX idx_be_status (status),
  INDEX idx_be_session (session_id),
  INDEX idx_be_student (student_id)
) ENGINE=InnoDB;

-- Auto-expire stale sessions (run via cron or event, or just check on read)
-- CREATE EVENT expire_enrollment_sessions
--   ON SCHEDULE EVERY 1 MINUTE DO
--   UPDATE enrollment_sessions SET status='EXPIRED' WHERE status='ACTIVE' AND expires_at < NOW();
