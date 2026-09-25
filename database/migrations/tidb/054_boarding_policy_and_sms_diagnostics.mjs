/**
 * 054 - Boarding attendance policy + SMS decision diagnostics.
 *
 *  attendance_boarding_policy : ONE row per school: DAILY_PUNCH (default = today's behaviour) or
 *                               REPORTED_ONCE, plus the reporting period. previous_mode/effective_from
 *                               protect history: dates before effective_from keep the old behaviour.
 *  boarding_reports           : "reported to school" facts, one per (school, learner, reporting period).
 *                               The UNIQUE key is also the idempotency key for BOARDING_REPORTED SMS.
 *  attendance_sms_decisions   : structured "why was / wasn't this SMS sent" records.
 *  notification_outbox        : + notification_type, attendance_date, subject_student_id, decision_id,
 *                               delivery_confirmed_at (only ever set by a provider delivery report).
 *
 * Everything is additive; existing schools stay on DAILY_PUNCH so nothing changes until an
 * administrator opts in.
 *
 * ROLLBACK:
 *   DROP TABLE IF EXISTS attendance_sms_decisions;
 *   DROP TABLE IF EXISTS boarding_reports;
 *   DROP TABLE IF EXISTS attendance_boarding_policy;
 *   ALTER TABLE notification_outbox DROP COLUMN notification_type, DROP COLUMN attendance_date,
 *     DROP COLUMN subject_student_id, DROP COLUMN decision_id, DROP COLUMN delivery_confirmed_at;
 */
async function hasColumn(query, table, column) {
  const rows = await query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, column],
  );
  return rows.length > 0;
}

async function hasIndex(query, table, index) {
  const rows = await query(
    `SELECT 1 FROM information_schema.statistics
      WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ? LIMIT 1`,
    [table, index],
  );
  return rows.length > 0;
}

export default async function up({ query, log }) {
  await query(`CREATE TABLE IF NOT EXISTS attendance_boarding_policy (
    school_id            BIGINT NOT NULL PRIMARY KEY,
    mode                 VARCHAR(16) NOT NULL DEFAULT 'DAILY_PUNCH',
    previous_mode        VARCHAR(16) DEFAULT NULL,
    effective_from       DATE DEFAULT NULL,
    reporting_period     VARCHAR(12) NOT NULL DEFAULT 'TERM',
    period_days          INT DEFAULT NULL,
    reported_sms_enabled TINYINT(1) NOT NULL DEFAULT 1,
    updated_by           BIGINT DEFAULT NULL,
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await query(`CREATE TABLE IF NOT EXISTS boarding_reports (
    id                   BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    school_id            BIGINT NOT NULL,
    student_id           BIGINT NOT NULL,
    person_id            BIGINT NOT NULL,
    period_key           VARCHAR(40) NOT NULL,
    period_start         DATE DEFAULT NULL,
    period_end           DATE DEFAULT NULL,
    reported_at          DATETIME NOT NULL,
    attendance_date      DATE NOT NULL,
    first_punch_event_id BIGINT DEFAULT NULL,
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_boarding_report (school_id, student_id, period_key),
    KEY idx_report_period (school_id, period_key)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  await query(`CREATE TABLE IF NOT EXISTS attendance_sms_decisions (
    id                BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    school_id         BIGINT NOT NULL,
    person_id         BIGINT NOT NULL,
    student_id        BIGINT DEFAULT NULL,
    attendance_date   DATE NOT NULL,
    notification_type VARCHAR(40) NOT NULL,
    decision          VARCHAR(16) NOT NULL,
    reason_code       VARCHAR(60) NOT NULL,
    decision_json     TEXT NOT NULL,
    outbox_id         BIGINT DEFAULT NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_decision (school_id, person_id, attendance_date, notification_type, decision, reason_code),
    KEY idx_decision_outbox (outbox_id),
    KEY idx_decision_school_date (school_id, attendance_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  const cols = [
    ['notification_type', 'VARCHAR(40) DEFAULT NULL'],
    ['attendance_date', 'DATE DEFAULT NULL'],
    ['subject_student_id', 'BIGINT DEFAULT NULL'],
    ['decision_id', 'BIGINT DEFAULT NULL'],
    ['delivery_confirmed_at', 'DATETIME DEFAULT NULL'],
  ];
  for (const [name, ddl] of cols) {
    if (!(await hasColumn(query, 'notification_outbox', name))) {
      await query(`ALTER TABLE notification_outbox ADD COLUMN ${name} ${ddl}`);
      log?.(`notification_outbox.${name} added`);
    }
  }
  if (!(await hasIndex(query, 'notification_outbox', 'idx_outbox_school_created'))) {
    await query(`ALTER TABLE notification_outbox ADD INDEX idx_outbox_school_created (school_id, created_at)`);
  }
  if (!(await hasIndex(query, 'notification_outbox', 'idx_outbox_type'))) {
    await query(`ALTER TABLE notification_outbox ADD INDEX idx_outbox_type (school_id, notification_type)`);
  }
}
