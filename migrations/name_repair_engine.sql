-- ============================================================================
-- DRAIS Name Repair Engine — schema for /api/students/repair-names
--
-- WHY THIS EXISTS:
--   Bulk-import corruption in late 2025 produced a population of learners with
--   first_name == last_name (the "Kalungi Kalungi", "Birungi Birungi" pattern,
--   plus silently-dropped other_name values). The corruption source was fixed
--   in src/app/api/students/import/route.ts (see PHASE 1A audit), but the
--   already-stored bad rows have to be repaired by the operator.
--
--   This engine accepts a correction spreadsheet:
--       Admission Number, First Name, Last Name, Other Name
--   matches against existing learners, lets the operator preview the diff
--   per row, and applies the batch in a single transaction. Every change is
--   logged into name_repair_changes for full rollback.
--
-- BACKWARDS-COMPATIBLE:
--   - IF NOT EXISTS on every CREATE
--   - Re-running is a no-op
--
-- Rollback:
--   DROP TABLE name_repair_changes;
--   DROP TABLE name_repair_sessions;
-- ============================================================================

-- 1. Repair sessions — one row per "upload + apply" run.
CREATE TABLE IF NOT EXISTS name_repair_sessions (
  id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_id       BIGINT       NOT NULL,
  actor_user_id   BIGINT       DEFAULT NULL,
  filename        VARCHAR(255) DEFAULT NULL,
  total_rows      INT          NOT NULL DEFAULT 0,
  matched_rows    INT          NOT NULL DEFAULT 0,
  applied_rows    INT          NOT NULL DEFAULT 0,
  /**
   * Lifecycle: previewed → applied → rolled_back.
   * Each transition is one POST. We never delete rows here; rollback
   * inverts the changes and flips the status only.
   */
  status          ENUM('previewed','applied','rolled_back')
                              NOT NULL DEFAULT 'previewed',
  applied_at      TIMESTAMP    NULL DEFAULT NULL,
  rolled_back_at  TIMESTAMP    NULL DEFAULT NULL,
  rolled_back_by  BIGINT       DEFAULT NULL,
  created_at      TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_school_status (school_id, status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Per-row changes — one row per (session, person, field) change.
--    Storing one row per field (not per person) lets us replay a
--    rollback by reading old_value back into the column even when a
--    subsequent edit happened on the unaffected fields.
CREATE TABLE IF NOT EXISTS name_repair_changes (
  id           BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id   BIGINT       NOT NULL,
  school_id    BIGINT       NOT NULL,
  person_id    BIGINT       NOT NULL,
  student_id   BIGINT       NOT NULL,
  admission_no VARCHAR(255) DEFAULT NULL,
  /** field_name ∈ ('first_name','last_name','other_name') */
  field_name   VARCHAR(40)  NOT NULL,
  old_value    VARCHAR(255) DEFAULT NULL,
  new_value    VARCHAR(255) DEFAULT NULL,
  /** When the change row was applied. NULL while the session is in
   *  `previewed`. */
  applied_at   TIMESTAMP    NULL DEFAULT NULL,
  /** When the change row was inverted by rollback. NULL otherwise. */
  reverted_at  TIMESTAMP    NULL DEFAULT NULL,
  INDEX idx_session (session_id),
  INDEX idx_person  (person_id),
  CONSTRAINT fk_name_repair_changes_session
    FOREIGN KEY (session_id) REFERENCES name_repair_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
