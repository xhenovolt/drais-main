/**
 * Phase 3 — runtime schema-ensure for the attendance engine.
 *
 * Mirrors src/lib/biometric/migrations/biometric-enrollments-schema.ts
 * (Phase 1). The canonical CREATE TABLE statements live in
 * src/Database/DRAIS.sql; this helper is defense-in-depth for
 * deployments that bypassed the schema file, AND it applies
 * ALTER TABLE ADD COLUMN IF NOT EXISTS for the legacy attendance_rules
 * table whose lazy shape (BIO-3 era) is missing the Phase 3 columns.
 *
 * Idempotent. Gated by an in-process promise so we pay the cost once
 * per process — never call without the gate on a hot path.
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

export function ensureAttendanceEngineSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      // attendance_rules — create + extend.
      await query(
        `CREATE TABLE IF NOT EXISTS attendance_rules (
           id              BIGINT PRIMARY KEY AUTO_INCREMENT,
           school_id       BIGINT NOT NULL,
           rule_name       VARCHAR(120) NOT NULL DEFAULT 'Default',
           rule_description TEXT DEFAULT NULL,
           arrival_start_time TIME DEFAULT NULL,
           arrival_end_time   TIME DEFAULT NULL,
           late_threshold_minutes INT NOT NULL DEFAULT 15,
           absence_cutoff_time  TIME DEFAULT NULL,
           closing_time         TIME DEFAULT NULL,
           applies_to           VARCHAR(20) NOT NULL DEFAULT 'students',
           applies_to_classes   VARCHAR(255) DEFAULT NULL,
           ignore_duplicate_scans_within_minutes INT NOT NULL DEFAULT 2,
           is_active            BOOLEAN NOT NULL DEFAULT TRUE,
           effective_date       DATE DEFAULT NULL,
           priority             INT NOT NULL DEFAULT 100,
           created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           updated_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           KEY idx_school_active (school_id, is_active, priority)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );

      // Phase 3 columns — applied as best-effort ALTER TABLE so old
      // databases keep working. MySQL 8 + TiDB support
      // ADD COLUMN IF NOT EXISTS; we wrap each in try/catch so a
      // missing-syntax engine still proceeds.
      for (const sql of [
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS departure_start_time TIME DEFAULT NULL`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS departure_end_time   TIME DEFAULT NULL`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS early_leave_threshold_minutes INT NOT NULL DEFAULT 30`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS half_day_threshold_minutes    INT NOT NULL DEFAULT 240`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS weekday_mask         TINYINT NOT NULL DEFAULT 31`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS applies_on_holidays  BOOLEAN NOT NULL DEFAULT FALSE`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS boarding_scope       VARCHAR(20) NOT NULL DEFAULT 'all'`,
        `ALTER TABLE attendance_rules ADD COLUMN IF NOT EXISTS auto_link_from_device_name BOOLEAN NOT NULL DEFAULT FALSE`,
      ]) {
        try { await query(sql, []); } catch { /* idempotent; ignore */ }
      }

      // holidays.
      await query(
        `CREATE TABLE IF NOT EXISTS holidays (
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
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );

      // attendance_raw_events.
      await query(
        `CREATE TABLE IF NOT EXISTS attendance_raw_events (
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
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );

      // Phase 0 dedup key for tables created before uk_raw_punch
      // existed. Fails harmlessly while duplicate rows are present —
      // apply database/migrations/020_attendance_trust_phase0.sql to
      // dedupe first; this then succeeds on the next cold start.
      try {
        const idx = (await query(
          `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
            WHERE TABLE_SCHEMA = DATABASE()
              AND TABLE_NAME = 'attendance_raw_events'
              AND INDEX_NAME = 'uk_raw_punch'
            LIMIT 1`,
          [],
        )) as unknown[];
        if (idx.length === 0) {
          await query(
            `ALTER TABLE attendance_raw_events
               ADD UNIQUE KEY uk_raw_punch (school_id, device_sn, device_user_id, punch_at, source)`,
            [],
          );
        }
      } catch {
        /* duplicates still present or no ALTER privilege — migration 020 handles it */
      }

      try {
        await query(
          `ALTER TABLE attendance_raw_events
             ADD COLUMN IF NOT EXISTS display_name VARCHAR(255) DEFAULT NULL`,
          [],
        );
      } catch {
        /* idempotent; ignore */
      }

      try {
        await query(
          `UPDATE attendance_raw_events ar
             LEFT JOIN device_user_directory dud
               ON dud.school_id = ar.school_id
              AND dud.device_sn = ar.device_sn
              AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
             LEFT JOIN people p
               ON p.id = ar.person_id
            SET ar.display_name = COALESCE(
                  NULLIF(TRIM(ar.display_name), ''),
                  NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), ''),
                  NULLIF(TRIM(dud.device_name), '')
                )
          WHERE ar.display_name IS NULL OR TRIM(ar.display_name) = ''`,
          [],
        );
      } catch {
        /* best-effort historical backfill */
      }

      // attendance_records.
      await query(
        `CREATE TABLE IF NOT EXISTS attendance_records (
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
