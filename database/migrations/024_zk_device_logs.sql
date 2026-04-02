-- ============================================================================
-- Migration #024: ZK Device Logs — Unified Observability Table
-- ALL ZKTeco ADMS interactions captured in one queryable table.
-- Every heartbeat, data receipt, parsed record, and error is stored here.
-- ============================================================================

CREATE TABLE IF NOT EXISTS zk_device_logs (
  id            BIGINT       NOT NULL AUTO_INCREMENT,

  -- Device identification
  device_sn     VARCHAR(100) NULL     COMMENT 'Serial number from ?SN= param',
  ip_address    VARCHAR(100) NULL     COMMENT 'Source IP of the device',

  -- What happened
  event_type    VARCHAR(50)  NOT NULL COMMENT 'HEARTBEAT | DATA_RECEIVED | DATA_PARSED | PUNCH_SAVED | ERROR',
  table_name    VARCHAR(50)  NULL     COMMENT 'ATTLOG | OPERLOG | USERINFO — from POST ?table= param',

  -- Payload storage
  raw_payload   TEXT         NULL     COMMENT 'Full raw request body (DATA_RECEIVED)',
  parsed_json   JSON         NULL     COMMENT 'Structured parsed data (DATA_PARSED)',

  -- Record meta
  record_count  INT          NOT NULL DEFAULT 0,
  user_id       VARCHAR(50)  NULL     COMMENT 'USERID from the punch record',
  check_time    DATETIME     NULL     COMMENT 'CHECKTIME from the punch record',

  -- Matching result
  matched       TINYINT(1)   NOT NULL DEFAULT 0,
  student_id    BIGINT       NULL,
  staff_id      BIGINT       NULL,

  -- Outcome
  status        VARCHAR(20)  NOT NULL DEFAULT 'success' COMMENT 'success | failed',
  error_message TEXT         NULL,

  -- Tenant isolation
  school_id     BIGINT       NOT NULL DEFAULT 1,

  created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  INDEX idx_device_sn (device_sn),
  INDEX idx_event_type (event_type),
  INDEX idx_school_created (school_id, created_at),
  INDEX idx_matched (matched),
  INDEX idx_status (status),
  INDEX idx_user_id (user_id),
  INDEX idx_check_time (check_time)

) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci AUTO_ID_CACHE 1
  COMMENT='ZK Device observability: every ADMS interaction stored here. NEVER truncate.';
