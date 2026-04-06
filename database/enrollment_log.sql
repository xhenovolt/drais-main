-- ─────────────────────────────────────────────────────────────────────────────
-- enrollment_log — audit trail for every biometric fingerprint enrollment attempt
--
-- Captures every enrollment initiation from both paths (local direct TCP + relay
-- agent).  The `status` column is initially 'initiated' and can be updated to
-- 'success' or 'failed' when the result is known.
--
-- Apply with:
--   mysql -u <user> -p drais < database/enrollment_log.sql
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS enrollment_log (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  school_id     INT             NOT NULL,
  student_id    INT             NOT NULL,
  uid           INT UNSIGNED    NOT NULL COMMENT 'ZKTeco device UID assigned to this student',
  finger        TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0-9, ZK finger slot index',
  device_sn     VARCHAR(64)     NOT NULL COMMENT 'Device serial or "LOCAL" for direct TCP path',
  path          ENUM('local', 'relay') NOT NULL COMMENT 'Enrollment path used',
  status        ENUM('initiated', 'success', 'failed') NOT NULL DEFAULT 'initiated',
  error_message TEXT            NULL,
  relay_cmd_id  BIGINT UNSIGNED NULL COMMENT 'relay_commands.id — relay path only',
  created_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_student   (student_id),
  INDEX idx_device_sn (device_sn),
  INDEX idx_created   (created_at),
  INDEX idx_school    (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  COMMENT='Audit log of every fingerprint enrollment attempt';
