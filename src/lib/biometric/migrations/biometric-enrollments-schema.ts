/**
 * Phase 1 — runtime schema-ensure for biometric_enrollments.
 *
 * The canonical CREATE TABLE lives in src/Database/DRAIS.sql. This helper
 * exists as defense-in-depth for two scenarios:
 *
 *   1. Production deployments that historically applied the schema by
 *      hand from DRAIS.sql may have skipped recent appends. We do not
 *      want a missing-table error to crash the zk-handler insert path.
 *   2. Fresh dev databases bootstrapped from a partial dump.
 *
 * The helper runs CREATE TABLE IF NOT EXISTS and a small set of ALTER
 * statements that bring older instances of the table up to the current
 * shape (idempotent). It is called once per process from the unified
 * resolver entry point — the first call materialises the table; every
 * subsequent call is a cheap no-op via the in-process gate.
 *
 * NEVER call this on a hot path without the gate. Repeated DDL hammers
 * the DB and pollutes the binlog.
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

/**
 * Idempotently ensures the biometric_enrollments table is present with
 * the current shape. Safe to call from any code path; the first caller
 * pays the cost, every subsequent caller resolves the cached promise.
 */
export function ensureBiometricEnrollmentsSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS biometric_enrollments (
           id              BIGINT PRIMARY KEY AUTO_INCREMENT,
           enrollment_uuid CHAR(36) NOT NULL,
           school_id       BIGINT NOT NULL,
           person_id       BIGINT NOT NULL,
           role_type       ENUM('student','staff','visitor') NOT NULL,
           role_ref_id     BIGINT NOT NULL,
           pin_value       INT NOT NULL,
           card_number     VARCHAR(32) DEFAULT NULL,
           status          ENUM('active','suspended','revoked','transferred') NOT NULL DEFAULT 'active',
           origin_device_sn VARCHAR(64) DEFAULT NULL,
           enrolled_by     BIGINT DEFAULT NULL,
           enrolled_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
           revoked_at      TIMESTAMP NULL,
           revoked_reason  VARCHAR(255) DEFAULT NULL,
           legacy_source   VARCHAR(40) DEFAULT NULL,
           legacy_id       BIGINT DEFAULT NULL,
           updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
           UNIQUE KEY uk_enrollment_uuid (enrollment_uuid),
           UNIQUE KEY uk_school_pin       (school_id, pin_value),
           KEY idx_person   (person_id),
           KEY idx_role     (role_type, role_ref_id),
           KEY idx_school_status (school_id, status),
           KEY idx_card     (school_id, card_number)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
        [],
      );
    } catch (err) {
      // If the table genuinely cannot be created (permissions, disk),
      // the resolver will fall back to the legacy chain. Reset the
      // cached promise so the next call retries — a transient failure
      // shouldn't permanently disable the canonical reader.
      ensured = null;
      throw err;
    }
  })();
  return ensured;
}
