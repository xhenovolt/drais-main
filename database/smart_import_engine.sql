-- ─────────────────────────────────────────────────────────────────────────────
-- DRAIS Smart Import Engine — Database Migration
-- Run once. All statements use IF NOT EXISTS / IGNORE so it is safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. External-reg flag on students
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS is_external_reg BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Import sessions (one record per bulk import run)
CREATE TABLE IF NOT EXISTS import_sessions (
  id               BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id        BIGINT        NOT NULL,
  user_id          BIGINT        NOT NULL,
  filename         VARCHAR(255)  DEFAULT NULL,
  total_rows       INT           NOT NULL DEFAULT 0,
  processed_rows   INT           NOT NULL DEFAULT 0,
  created_count    INT           NOT NULL DEFAULT 0,
  updated_count    INT           NOT NULL DEFAULT 0,
  skipped_count    INT           NOT NULL DEFAULT 0,
  failed_count     INT           NOT NULL DEFAULT 0,
  status           ENUM('running','paused','cancelled','completed','failed')
                                NOT NULL DEFAULT 'running',
  options          JSON          DEFAULT NULL,   -- updateExisting, createNew, feesOnly, enrollNew
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school_status (school_id, status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Per-row import errors
CREATE TABLE IF NOT EXISTS import_errors (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id  BIGINT       NOT NULL,
  row_number  INT          NOT NULL,
  reason      VARCHAR(500) DEFAULT NULL,
  raw_data    JSON         DEFAULT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
