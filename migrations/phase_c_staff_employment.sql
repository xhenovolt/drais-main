-- ============================================================================
-- Phase C — Employment lifecycle
--
-- Replace the single mutable `staff.status` field with an append-only
-- event log so joins, suspensions, transfers and terminations become
-- time-ordered records instead of a destructive in-place update.
--
-- Invariants:
--   * staff_employment is append-only at the application layer; rows are
--     never UPDATEd. A new "event" is always a fresh INSERT with
--     event_date = NOW() and a fresh status.
--   * staff.status still exists and reflects the LATEST event's status
--     as a cached convenience (avoids correlated subqueries on hot reads).
--     The application is responsible for keeping it in sync; a future
--     trigger could enforce this.
--   * The first backfilled row per staff carries start_date = hire_date
--     (where set) or created_at; status mirrors the current staff.status.
--
-- Rollback:
--   DROP TABLE staff_employment;
-- ============================================================================

CREATE TABLE IF NOT EXISTS staff_employment (
  id                BIGINT       NOT NULL AUTO_INCREMENT,
  staff_id          BIGINT       NOT NULL,
  school_id         BIGINT       NOT NULL,
  /** The kind of event that produced this row. */
  event_type        ENUM(
                      'hired',
                      'reactivated',
                      'suspended',
                      'on_leave',
                      'returned_from_leave',
                      'transferred',
                      'promoted',
                      'demoted',
                      'terminated'
                    ) NOT NULL,
  /** The status the staff member enters as a result of this event. */
  status            ENUM('active','on_leave','suspended','terminated')
                    NOT NULL,
  contract_type     ENUM('permanent','fixed_term','contract','volunteer','part_time')
                    NULL,
  /** Effective date of this event. event_date is the audit timestamp;
      effective_date may be backdated. */
  effective_date    DATE         NOT NULL,
  /** End date for fixed-term contracts; NULL for indefinite. */
  end_date          DATE         NULL,
  salary_grade      VARCHAR(40)  NULL,
  /** Position at the time of this event — snapshot of staff.position_id
      so the history survives later position changes. */
  position_id       BIGINT       NULL,
  /** Department at the time of this event. */
  department_id     BIGINT       NULL,
  reason            VARCHAR(500) NULL,
  notes             TEXT         NULL,
  recorded_by       INT          NOT NULL,
  event_date        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_staff_event (staff_id, event_date DESC),
  KEY idx_school_status (school_id, status),
  CONSTRAINT fk_employment_staff
    FOREIGN KEY (staff_id) REFERENCES staff(id) ON DELETE CASCADE,
  CONSTRAINT fk_employment_position
    FOREIGN KEY (position_id) REFERENCES positions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Backfill: every staff row gets a single 'hired' event mirroring its
-- current status. recorded_by uses a sentinel of 0 (system backfill) so
-- the column constraint holds without inventing a real user.
INSERT IGNORE INTO staff_employment
  (staff_id, school_id, event_type, status, contract_type,
   effective_date, position_id, department_id,
   reason, recorded_by, event_date)
SELECT
  s.id,
  s.school_id,
  CASE
    WHEN s.status = 'terminated' THEN 'terminated'
    WHEN s.status = 'suspended'  THEN 'suspended'
    WHEN s.status = 'on_leave'   THEN 'on_leave'
    ELSE 'hired'
  END AS event_type,
  CASE
    WHEN s.status IN ('active','on_leave','suspended','terminated') THEN s.status
    ELSE 'active'
  END AS status,
  CASE
    WHEN s.employment_type = 'part-time'  THEN 'part_time'
    WHEN s.employment_type IN ('permanent','contract','volunteer') THEN s.employment_type
    ELSE NULL
  END AS contract_type,
  COALESCE(s.hire_date, DATE(s.updated_at), CURDATE()) AS effective_date,
  s.position_id,
  s.department_id,
  'Backfilled from staff.status during Phase C migration' AS reason,
  0 AS recorded_by,
  COALESCE(s.updated_at, NOW()) AS event_date
FROM staff s
WHERE NOT EXISTS (
  SELECT 1 FROM staff_employment e WHERE e.staff_id = s.id
);
