-- Biometric pass-out / permission slips + visitation cards. Additive only.

-- Gate tagging: mark a device as a pass-out/visitation gate. (device_type
-- already exists for attendance/gate/… classification; this is the explicit
-- opt-in the pass-out engine checks.)
ALTER TABLE devices ADD COLUMN IF NOT EXISTS passout_enabled TINYINT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS passout_requests (
  id                       BIGINT       NOT NULL AUTO_INCREMENT,
  external_id              VARCHAR(40)  NULL,
  school_id                BIGINT       NOT NULL,
  student_id               BIGINT       NOT NULL,
  requested_by             BIGINT       NULL,
  approved_by              BIGINT       NULL,
  status                   VARCHAR(16)  NOT NULL DEFAULT 'pending', -- draft|pending|approved|rejected|cancelled|expired|used|returned|overdue
  reason                   VARCHAR(255) NULL,
  destination              VARCHAR(255) NULL,
  guardian_contact_id      BIGINT       NULL,
  guardian_phone_snapshot  VARCHAR(40)  NULL,
  approved_from            DATETIME     NULL,
  approved_until           DATETIME     NULL,
  expected_return_at       DATETIME     NULL,
  actual_exit_at           DATETIME     NULL,
  actual_return_at         DATETIME     NULL,
  exit_device_sn           VARCHAR(64)  NULL,
  return_device_sn         VARCHAR(64)  NULL,
  exit_verified_by_event_id   BIGINT    NULL,
  return_verified_by_event_id BIGINT    NULL,
  notes                    TEXT         NULL,
  created_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at               TIMESTAMP    NULL,
  PRIMARY KEY (id),
  KEY idx_school_student (school_id, student_id),
  KEY idx_school_status (school_id, status),
  KEY idx_active (school_id, student_id, status, approved_until)
);

CREATE TABLE IF NOT EXISTS passout_events (
  id                     BIGINT       NOT NULL AUTO_INCREMENT,
  school_id              BIGINT       NOT NULL,
  passout_id             BIGINT       NULL,
  student_id             BIGINT       NULL,
  attendance_raw_event_id BIGINT      NULL,   -- zk_attendance_logs.id
  device_sn              VARCHAR(64)  NULL,
  event_type             VARCHAR(20)  NOT NULL, -- exit_attempt|exit_allowed|exit_denied|return_attempt|return_recorded|invalid_attempt
  decision               VARCHAR(10)  NULL,     -- allowed|denied|review
  reason                 VARCHAR(255) NULL,
  created_by             BIGINT       NULL,     -- NULL = system/gate
  created_at             TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school_created (school_id, created_at),
  KEY idx_passout (passout_id),
  KEY idx_student (school_id, student_id)
);

CREATE TABLE IF NOT EXISTS visitation_cards (
  id                  BIGINT       NOT NULL AUTO_INCREMENT,
  school_id           BIGINT       NOT NULL,
  card_uid            VARCHAR(64)  NOT NULL,
  card_type           VARCHAR(16)  NOT NULL DEFAULT 'zkteco_rfid', -- zkteco_rfid|manual|qr
  guardian_contact_id BIGINT       NULL,
  student_id          BIGINT       NULL,
  status              VARCHAR(12)  NOT NULL DEFAULT 'active', -- active|suspended|lost|expired
  issued_by           BIGINT       NULL,
  issued_at           TIMESTAMP    NULL,
  expires_at          DATETIME     NULL,
  notes               VARCHAR(255) NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school_uid (school_id, card_uid),
  KEY idx_school_status (school_id, status)
);

CREATE TABLE IF NOT EXISTS visitation_events (
  id                  BIGINT       NOT NULL AUTO_INCREMENT,
  school_id           BIGINT       NOT NULL,
  card_id             BIGINT       NULL,
  card_uid            VARCHAR(64)  NULL,
  guardian_contact_id BIGINT       NULL,
  student_id          BIGINT       NULL,
  device_sn           VARCHAR(64)  NULL,
  event_type          VARCHAR(20)  NOT NULL, -- visit_attempt|visit_allowed|visit_denied|pickup_attempt|pickup_allowed|pickup_denied
  decision            VARCHAR(10)  NULL,
  reason              VARCHAR(255) NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_school_created (school_id, created_at),
  KEY idx_card (school_id, card_uid)
);
