-- ============================================================================
-- DRAIS Smart Import Engine — schema for /api/students/import
--
-- WHY THIS LIVES IN migrations/ NOW:
--   Originally landed at database/smart_import_engine.sql, which is OUTSIDE
--   the standard migrations directory used by `npm run import:schema`. As a
--   result, schools deploying DRAIS were running into:
--       Error: Table 'drais.import_sessions' doesn't exist
--   on the very first call to POST /api/students/import — every learner
--   import attempt failed before a single row was processed.
--
--   This file is a verbatim copy in the standard location so future deploys
--   pick it up automatically.
--
-- BACKWARDS-COMPATIBLE:
--   - IF NOT EXISTS on every CREATE
--   - ADD COLUMN IF NOT EXISTS on the students ALTER
--   - Re-running this migration is a no-op
--   - The /api/students/import route in this commit is ALSO patched to be
--     resilient: if these tables don't exist (or any session-tracking write
--     fails), the import still proceeds; session-tracking degrades silently.
--
-- Rollback:
--   DROP TABLE import_errors;
--   DROP TABLE import_sessions;
--   ALTER TABLE students DROP COLUMN is_external_reg;
-- ============================================================================

-- 1. External-reg flag on students (used by smart-import matching engine)
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
  /** JSON blob: updateExisting / createNew / feesOnly / enrollNew flags. */
  options          JSON          DEFAULT NULL,
  created_at       TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP     NULL     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_school_status (school_id, status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Per-row import errors
CREATE TABLE IF NOT EXISTS import_errors (
  id          BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id  BIGINT       NOT NULL,
  `row_number`  INT          NOT NULL,
  reason      VARCHAR(500) DEFAULT NULL,
  raw_data    JSON         DEFAULT NULL,
  created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
