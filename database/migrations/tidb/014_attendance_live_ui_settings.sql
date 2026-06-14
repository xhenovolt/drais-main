-- 014 — per-school live attendance popup configuration.
CREATE TABLE IF NOT EXISTS attendance_live_ui_settings (
  school_id          BIGINT PRIMARY KEY,
  live_popup_enabled TINYINT(1) NOT NULL DEFAULT 1,
  show_for_students  TINYINT(1) NOT NULL DEFAULT 1,
  show_for_staff     TINYINT(1) NOT NULL DEFAULT 1,
  show_for_unknown   TINYINT(1) NOT NULL DEFAULT 1,
  show_for_late_only TINYINT(1) NOT NULL DEFAULT 0,
  show_sms_status    TINYINT(1) NOT NULL DEFAULT 1,
  show_guardian_phone TINYINT(1) NOT NULL DEFAULT 0,
  show_fee_balance   TINYINT(1) NOT NULL DEFAULT 0,
  sound_enabled      TINYINT(1) NOT NULL DEFAULT 1,
  popup_duration_ms  INT NOT NULL DEFAULT 5000,   -- 0 = require manual close
  mount_scope        VARCHAR(24) NOT NULL DEFAULT 'attendance', -- global|attendance|students
  created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
