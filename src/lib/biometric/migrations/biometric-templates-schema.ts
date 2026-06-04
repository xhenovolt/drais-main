/**
 * Phase 4 — runtime schema-ensure for the template distribution tables.
 *
 * Mirrors the Phase 1/2/3 helpers. Canonical CREATE TABLE in
 * src/Database/DRAIS.sql; this is the defense-in-depth path for
 * deployments that bypassed the schema file.
 *
 * Idempotent; gated by an in-process promise.
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

export function ensureBiometricTemplatesSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS biometric_templates (
           id                 BIGINT PRIMARY KEY AUTO_INCREMENT,
           enrollment_id      BIGINT NOT NULL,
           finger_index       TINYINT NOT NULL,
           template_bytes     MEDIUMBLOB NOT NULL,
           template_size      INT DEFAULT NULL,
           template_format    VARCHAR(20) NOT NULL DEFAULT 'ZK_ADMS',
           quality_score      INT DEFAULT NULL,
           captured_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           captured_device_sn VARCHAR(64) DEFAULT NULL,
           updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           UNIQUE KEY uk_enrollment_finger (enrollment_id, finger_index),
           KEY idx_enrollment (enrollment_id),
           KEY idx_captured_device (captured_device_sn)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );

      await query(
        `CREATE TABLE IF NOT EXISTS template_distributions (
           id              BIGINT PRIMARY KEY AUTO_INCREMENT,
           template_id     BIGINT NOT NULL,
           device_sn       VARCHAR(64) NOT NULL,
           status          ENUM('queued','loading','loaded','failed','removed') NOT NULL DEFAULT 'queued',
           queued_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           attempted_at    TIMESTAMP NULL,
           loaded_at       TIMESTAMP NULL,
           attempts        INT NOT NULL DEFAULT 0,
           last_error      VARCHAR(255) DEFAULT NULL,
           UNIQUE KEY uk_template_device (template_id, device_sn),
           KEY idx_device_status (device_sn, status),
           KEY idx_queued (status, queued_at)
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
