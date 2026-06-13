-- 001 — canonical attendance/biometric core tables (idempotent).
-- Creates every table the trust refactor depends on that may be
-- missing from a given database. Existing tables are untouched
-- (CREATE TABLE IF NOT EXISTS). biometric_enrollments is handled by
-- 002 (conditional shape migration), NOT here.

CREATE TABLE IF NOT EXISTS attendance_raw_events (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id       BIGINT NOT NULL,
  device_sn       VARCHAR(64) NOT NULL,
  device_user_id  INT NOT NULL,
  display_name    VARCHAR(255) DEFAULT NULL,
  enrollment_id   BIGINT DEFAULT NULL,
  person_id       BIGINT DEFAULT NULL,
  role_type       ENUM('student','staff','visitor') DEFAULT NULL,
  role_ref_id     BIGINT DEFAULT NULL,
  punch_at        DATETIME NOT NULL,
  verify_type     TINYINT DEFAULT NULL,
  io_mode         TINYINT DEFAULT NULL,
  source          ENUM('zkteco_push','dahua_pull','manual','relay') NOT NULL,
  matched         BOOLEAN NOT NULL DEFAULT FALSE,
  resolution_path VARCHAR(20) DEFAULT NULL,
  resolution_score DECIMAL(4,3) DEFAULT NULL,
  legacy_table    VARCHAR(40) DEFAULT NULL,
  legacy_id       BIGINT DEFAULT NULL,
  ingested_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_raw_punch (school_id, device_sn, device_user_id, punch_at, source),
  KEY idx_school_punch  (school_id, punch_at),
  KEY idx_device_pin    (device_sn, device_user_id, punch_at),
  KEY idx_person_day    (person_id, punch_at),
  KEY idx_unresolved    (matched, school_id, ingested_at),
  KEY idx_legacy        (legacy_table, legacy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_records (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id       BIGINT NOT NULL,
  person_id       BIGINT NOT NULL,
  role_type       ENUM('student','staff') NOT NULL,
  attendance_date DATE NOT NULL,
  first_in_at     DATETIME DEFAULT NULL,
  last_out_at     DATETIME DEFAULT NULL,
  first_in_device VARCHAR(64) DEFAULT NULL,
  last_out_device VARCHAR(64) DEFAULT NULL,
  status          ENUM('present','late','absent','half_day','early_leave','holiday','weekend') NOT NULL,
  late_minutes    INT NOT NULL DEFAULT 0,
  early_minutes   INT NOT NULL DEFAULT 0,
  total_minutes   INT NOT NULL DEFAULT 0,
  rule_id         BIGINT DEFAULT NULL,
  raw_event_count INT NOT NULL DEFAULT 0,
  evaluated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_person_day (person_id, attendance_date),
  KEY idx_school_day    (school_id, attendance_date),
  KEY idx_status        (school_id, attendance_date, status),
  KEY idx_school_role   (school_id, role_type, attendance_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_rules (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id       BIGINT NOT NULL,
  rule_name       VARCHAR(120) NOT NULL DEFAULT 'Default',
  rule_description TEXT DEFAULT NULL,
  arrival_start_time TIME DEFAULT NULL,
  arrival_end_time   TIME DEFAULT NULL,
  late_threshold_minutes INT NOT NULL DEFAULT 15,
  absence_cutoff_time  TIME DEFAULT NULL,
  closing_time         TIME DEFAULT NULL,
  departure_start_time TIME DEFAULT NULL,
  departure_end_time   TIME DEFAULT NULL,
  early_leave_threshold_minutes INT NOT NULL DEFAULT 30,
  half_day_threshold_minutes    INT NOT NULL DEFAULT 240,
  weekday_mask         TINYINT NOT NULL DEFAULT 31,
  applies_on_holidays  BOOLEAN NOT NULL DEFAULT FALSE,
  boarding_scope       ENUM('all','boarding','day') NOT NULL DEFAULT 'all',
  auto_link_from_device_name BOOLEAN NOT NULL DEFAULT FALSE,
  applies_to           ENUM('students','teachers','all') NOT NULL DEFAULT 'students',
  applies_to_classes   VARCHAR(255) DEFAULT NULL,
  ignore_duplicate_scans_within_minutes INT NOT NULL DEFAULT 2,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  effective_date       DATE DEFAULT NULL,
  priority             INT NOT NULL DEFAULT 100,
  created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_school_active (school_id, is_active, priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS holidays (
  id            BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id     BIGINT DEFAULT NULL,
  holiday_date  DATE NOT NULL,
  name          VARCHAR(150) NOT NULL,
  scope         ENUM('national','school','class') NOT NULL DEFAULT 'school',
  applies_to_classes VARCHAR(255) DEFAULT NULL,
  created_by    BIGINT DEFAULT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_school_date_name (school_id, holiday_date, name),
  KEY idx_date (holiday_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS attendance_daily_aggregates (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id       BIGINT NOT NULL,
  class_id        BIGINT NOT NULL DEFAULT 0,
  attendance_date DATE NOT NULL,
  role_type       ENUM('student','staff') NOT NULL,
  status          ENUM('present','late','absent','half_day','early_leave','holiday','weekend') NOT NULL,
  count           INT NOT NULL DEFAULT 0,
  last_refreshed  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_bucket (school_id, class_id, attendance_date, role_type, status),
  KEY idx_school_day  (school_id, attendance_date),
  KEY idx_school_class_day (school_id, class_id, attendance_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS biometric_templates (
  id                 BIGINT PRIMARY KEY AUTO_INCREMENT,
  enrollment_id      BIGINT NOT NULL,
  finger_index       TINYINT NOT NULL,
  template_bytes     MEDIUMBLOB NOT NULL,
  template_size      INT DEFAULT NULL,
  template_format    VARCHAR(20) NOT NULL DEFAULT 'ZK_ADMS',
  quality_score      INT DEFAULT NULL,
  captured_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  captured_device_sn VARCHAR(64) DEFAULT NULL,
  updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_enrollment_finger (enrollment_id, finger_index),
  KEY idx_enrollment (enrollment_id),
  KEY idx_captured_device (captured_device_sn)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS template_distributions (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  template_id     BIGINT NOT NULL,
  device_sn       VARCHAR(64) NOT NULL,
  status          ENUM('queued','loading','loaded','failed','removed') NOT NULL DEFAULT 'queued',
  queued_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  attempted_at    TIMESTAMP NULL,
  loaded_at       TIMESTAMP NULL,
  attempts        INT NOT NULL DEFAULT 0,
  last_error      VARCHAR(255) DEFAULT NULL,
  UNIQUE KEY uk_template_device (template_id, device_sn),
  KEY idx_device_status (device_sn, status),
  KEY idx_queued (status, queued_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_policies (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id       BIGINT NOT NULL,
  name            VARCHAR(120) NOT NULL,
  event_type      VARCHAR(60) NOT NULL,
  target_role     ENUM('guardian','self','staff_room','admin') NOT NULL DEFAULT 'guardian',
  channel         ENUM('sms','email','push') NOT NULL DEFAULT 'sms',
  conditions      JSON DEFAULT NULL,
  template_body   VARCHAR(480) DEFAULT NULL,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  daily_cap       INT NOT NULL DEFAULT 5000,
  created_by      BIGINT DEFAULT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_school_event (school_id, event_type, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_outbox (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  policy_id       BIGINT NOT NULL,
  school_id       BIGINT NOT NULL,
  subject_person_id BIGINT DEFAULT NULL,
  recipient_phone VARCHAR(30) DEFAULT NULL,
  recipient_email VARCHAR(150) DEFAULT NULL,
  recipient_name  VARCHAR(120) DEFAULT NULL,
  channel         ENUM('sms','email','push') NOT NULL,
  body            VARCHAR(480) NOT NULL,
  status          ENUM('queued','sending','delivered','failed','expired') NOT NULL DEFAULT 'queued',
  attempts        INT NOT NULL DEFAULT 0,
  max_attempts    INT NOT NULL DEFAULT 3,
  last_error      VARCHAR(255) DEFAULT NULL,
  dedup_key       VARCHAR(120) DEFAULT NULL,
  scheduled_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  attempted_at    TIMESTAMP NULL,
  delivered_at    TIMESTAMP NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dedup (dedup_key),
  KEY idx_status_sched (status, scheduled_at),
  KEY idx_school_status (school_id, status, created_at),
  KEY idx_policy (policy_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification_deliveries (
  id                 BIGINT PRIMARY KEY AUTO_INCREMENT,
  outbox_id          BIGINT NOT NULL,
  school_id          BIGINT NOT NULL,
  provider           VARCHAR(40) NOT NULL,
  provider_message_id VARCHAR(120) DEFAULT NULL,
  cost               VARCHAR(20) DEFAULT NULL,
  success            BOOLEAN NOT NULL,
  error              VARCHAR(255) DEFAULT NULL,
  delivered_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_outbox (outbox_id),
  KEY idx_school_day (school_id, delivered_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_transfers (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_sn       VARCHAR(64) NOT NULL,
  from_school_id  BIGINT DEFAULT NULL,
  to_school_id    BIGINT DEFAULT NULL,
  initiated_by    BIGINT DEFAULT NULL,
  initiated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at    TIMESTAMP NULL,
  status          ENUM('initiated','released','acquired','decommissioned','aborted') NOT NULL,
  reason          VARCHAR(255) DEFAULT NULL,
  enrollments_archived INT NOT NULL DEFAULT 0,
  orphans_archived     INT NOT NULL DEFAULT 0,
  raw_events_preserved INT NOT NULL DEFAULT 0,
  KEY idx_device_time (device_sn, initiated_at),
  KEY idx_from_school (from_school_id),
  KEY idx_to_school   (to_school_id),
  KEY idx_status      (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_alerts (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  device_sn       VARCHAR(64) NOT NULL,
  school_id       BIGINT DEFAULT NULL,
  severity        ENUM('info','warning','critical') NOT NULL DEFAULT 'warning',
  code            VARCHAR(40) NOT NULL,
  message         VARCHAR(255) DEFAULT NULL,
  details         JSON DEFAULT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP NULL,
  acknowledged_by BIGINT DEFAULT NULL,
  KEY idx_device_time  (device_sn, created_at),
  KEY idx_school_open  (school_id, acknowledged_at, severity),
  KEY idx_code_open    (code, acknowledged_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS device_user_directory (
  id              BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id       BIGINT       DEFAULT NULL,
  device_sn       VARCHAR(64)  NOT NULL,
  device_user_id  VARCHAR(64)  NOT NULL,
  device_name     VARCHAR(255) NOT NULL,
  device_card     VARCHAR(64)  DEFAULT NULL,
  device_priv     VARCHAR(8)   DEFAULT NULL,
  first_seen      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_dud (device_sn, device_user_id),
  KEY idx_dud_name (device_name),
  KEY idx_dud_school (school_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS fingerprint_orphans (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id       BIGINT       DEFAULT NULL,
  device_sn       VARCHAR(64)  NOT NULL,
  device_user_id  VARCHAR(64)  NOT NULL,
  finger_id       VARCHAR(8)   NOT NULL,
  template_size   INT          DEFAULT NULL,
  template_data   LONGTEXT     NOT NULL,
  valid_flag      VARCHAR(8)   DEFAULT NULL,
  captured_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at      DATETIME     DEFAULT NULL,
  claimed_by      BIGINT       DEFAULT NULL,
  claimed_student_id BIGINT    DEFAULT NULL,
  claimed_staff_id   BIGINT    DEFAULT NULL,
  UNIQUE KEY uk_orphan (device_sn, device_user_id, finger_id),
  KEY idx_orphan_unclaimed (claimed_at, device_sn),
  KEY idx_orphan_school (school_id, captured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS pending_device_users (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id        BIGINT DEFAULT NULL,
  device_sn        VARCHAR(100) NOT NULL,
  device_user_pin  VARCHAR(100) NOT NULL,
  device_name      VARCHAR(255) DEFAULT NULL,
  device_card      VARCHAR(64)  DEFAULT NULL,
  status           ENUM('pending','ambiguous','mapped','ignored','quarantined') NOT NULL DEFAULT 'pending',
  reason           VARCHAR(255) DEFAULT NULL,
  candidates_json  TEXT DEFAULT NULL,
  resolved_by      BIGINT DEFAULT NULL,
  resolved_at      DATETIME DEFAULT NULL,
  resolved_enrollment_id BIGINT DEFAULT NULL,
  first_seen       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_pdu (school_id, device_sn, device_user_pin),
  KEY idx_pdu_status (school_id, status, last_seen)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
