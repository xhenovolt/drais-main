-- ============================================================================
-- Migration #025: Raw-First Pipeline — Enhance zk_raw_logs + Create zk_parsed_logs
-- GUARANTEE: Every HTTP request is stored before any processing happens.
-- ============================================================================

-- ── 1. Enhance zk_raw_logs with missing fields ──────────────────────────────
-- Adding: headers (full HTTP headers), endpoint, school_id
-- TiDB requires separate ALTER statements for each column.

ALTER TABLE zk_raw_logs ADD COLUMN headers   JSON         NULL     COMMENT 'Full HTTP request headers';
ALTER TABLE zk_raw_logs ADD COLUMN endpoint  VARCHAR(100) NULL     COMMENT '/iclock/cdata path';
ALTER TABLE zk_raw_logs ADD COLUMN school_id BIGINT       NOT NULL DEFAULT 1;

ALTER TABLE zk_raw_logs ADD INDEX idx_school_created (school_id, created_at);

-- ── 2. Create zk_parsed_logs — per-record structured data ───────────────────
-- Every line from a POST body gets its own row.
-- Links back to zk_raw_logs.id for forensic tracing.
-- Failed parses are stored too — with error_message.

CREATE TABLE IF NOT EXISTS zk_parsed_logs (
  id            BIGINT       NOT NULL AUTO_INCREMENT,

  raw_log_id    BIGINT       NULL     COMMENT 'FK → zk_raw_logs.id (forensic link)',
  device_sn     VARCHAR(100) NULL,
  school_id     BIGINT       NOT NULL DEFAULT 1,

  table_name    VARCHAR(50)  NULL     COMMENT 'ATTLOG | OPERLOG | USERINFO',
  raw_line      TEXT         NULL     COMMENT 'Exact line from body that produced this record',

  -- Parsed fields (ATTLOG)
  user_id       VARCHAR(50)  NULL     COMMENT 'USERID from device',
  check_time    DATETIME     NULL     COMMENT 'CHECKTIME normalized',
  verify_type   VARCHAR(10)  NULL,
  inout_mode    VARCHAR(10)  NULL,
  work_code     VARCHAR(10)  NULL,
  log_id        VARCHAR(50)  NULL,

  -- Matching
  matched       TINYINT(1)   NOT NULL DEFAULT 0,
  student_id    BIGINT       NULL,
  staff_id      BIGINT       NULL,

  -- Outcome
  status        VARCHAR(20)  NOT NULL DEFAULT 'success' COMMENT 'success | failed',
  error_message TEXT         NULL,

  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_raw_log_id  (raw_log_id),
  INDEX idx_device_sn   (device_sn),
  INDEX idx_school_time (school_id, created_at),
  INDEX idx_status      (status),
  INDEX idx_matched     (matched),
  INDEX idx_user_id     (user_id),
  INDEX idx_table_name  (table_name)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1
  COMMENT='Per-record parsed ZK data. Every line from every POST gets a row — success or failure.';
