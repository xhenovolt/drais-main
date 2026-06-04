/**
 * Phase 6 — runtime schema-ensure for the aggregates table.
 * Mirrors the Phase 1/2/3/4/5 helpers.
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

export function ensureAggregatesSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS attendance_daily_aggregates (
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
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );
    } catch (err) {
      ensured = null;
      throw err;
    }
  })();
  return ensured;
}
