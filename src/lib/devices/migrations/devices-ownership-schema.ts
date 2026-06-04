/**
 * Phase 2 — runtime schema-ensure for the device ownership tables.
 *
 * Mirrors the Phase 1 + Phase 3 helpers: canonical CREATE TABLE in
 * src/Database/DRAIS.sql; this is the defense-in-depth path for
 * deployments that bypassed the schema file.
 *
 * Idempotent. Gated by an in-process promise so DDL fires once per
 * process.
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

export function ensureDeviceOwnershipSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS device_transfers (
           id              BIGINT PRIMARY KEY AUTO_INCREMENT,
           device_sn       VARCHAR(64) NOT NULL,
           from_school_id  BIGINT DEFAULT NULL,
           to_school_id    BIGINT DEFAULT NULL,
           initiated_by    BIGINT DEFAULT NULL,
           initiated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           completed_at    TIMESTAMP NULL,
           status          ENUM('initiated','released','acquired','decommissioned','aborted') NOT NULL,
           reason          VARCHAR(255) DEFAULT NULL,
           enrollments_archived INT NOT NULL DEFAULT 0,
           orphans_archived     INT NOT NULL DEFAULT 0,
           raw_events_preserved INT NOT NULL DEFAULT 0,
           KEY idx_device_time (device_sn, initiated_at),
           KEY idx_from_school (from_school_id),
           KEY idx_to_school   (to_school_id),
           KEY idx_status      (status)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );

      await query(
        `CREATE TABLE IF NOT EXISTS device_alerts (
           id              BIGINT PRIMARY KEY AUTO_INCREMENT,
           device_sn       VARCHAR(64) NOT NULL,
           school_id       BIGINT DEFAULT NULL,
           severity        ENUM('info','warning','critical') NOT NULL DEFAULT 'warning',
           code            VARCHAR(40) NOT NULL,
           message         VARCHAR(255) DEFAULT NULL,
           details         JSON DEFAULT NULL,
           created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           acknowledged_at TIMESTAMP NULL,
           acknowledged_by BIGINT DEFAULT NULL,
           KEY idx_device_time  (device_sn, created_at),
           KEY idx_school_open  (school_id, acknowledged_at, severity),
           KEY idx_code_open    (code, acknowledged_at)
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
