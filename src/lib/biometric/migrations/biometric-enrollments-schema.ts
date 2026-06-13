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
 * SCHEMA COLLISION RESOLUTION (attendance trust refactor, Phase 1A)
 * -----------------------------------------------------------------
 * The forensic audit found TWO incompatible shapes competing for the
 * `biometric_enrollments` table name:
 *
 *   OLD  (database/biometric_enrollment_pipeline.sql): device_slot,
 *        student_id, session_id, status INITIATED/CAPTURED/ASSIGNED/…
 *   NEW  (this file / DRAIS.sql): enrollment_uuid, person_id,
 *        role_type, role_ref_id, pin_value, status active/…
 *
 * Because both used CREATE TABLE IF NOT EXISTS, whichever ran first
 * won and the other generation's reads/writes failed silently forever.
 *
 * This helper now DETECTS the installed shape before creating:
 *   - table absent            → create canonical (NEW).
 *   - table present, has
 *     pin_value               → canonical already installed; ensure the
 *                               'pending_capture' status member exists.
 *   - table present, NO
 *     pin_value (OLD shape)   → RENAME to biometric_enrollments_legacy
 *                               (never dropped — rollback is RENAME
 *                               back), create canonical, then best-
 *                               effort backfill resolvable legacy rows.
 *
 * The 'pending_capture' status (Phase 1B) marks an enrollment whose
 * identity+PIN are committed but whose fingerprint template has not
 * yet arrived from the device. The resolver only matches 'active', so
 * a pending enrollment never attributes punches; processFingerprint
 * flips pending_capture → active when the template lands.
 *
 * NEVER call this on a hot path without the gate. Repeated DDL hammers
 * the DB and pollutes the binlog.
 */
import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

const CANONICAL_CREATE = `CREATE TABLE IF NOT EXISTS biometric_enrollments (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  enrollment_uuid CHAR(36) NOT NULL,
  school_id       BIGINT NOT NULL,
  person_id       BIGINT NOT NULL,
  role_type       ENUM('student','staff','visitor') NOT NULL,
  role_ref_id     BIGINT NOT NULL,
  pin_value       INT NOT NULL,
  card_number     VARCHAR(32) DEFAULT NULL,
  status          ENUM('active','pending_capture','suspended','revoked','transferred') NOT NULL DEFAULT 'active',
  origin_device_sn VARCHAR(64) DEFAULT NULL,
  enrolled_by     BIGINT DEFAULT NULL,
  enrolled_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  revoked_at      TIMESTAMP NULL,
  revoked_reason  VARCHAR(255) DEFAULT NULL,
  legacy_source   VARCHAR(40) DEFAULT NULL,
  legacy_id       BIGINT DEFAULT NULL,
  capture_status  VARCHAR(24) NOT NULL DEFAULT 'not_requested',
  captured_at     DATETIME DEFAULT NULL,
  last_seen_on_device_at DATETIME DEFAULT NULL,
  updated_by      BIGINT DEFAULT NULL,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_enrollment_uuid (enrollment_uuid),
  UNIQUE KEY uk_school_pin       (school_id, pin_value),
  KEY idx_person   (person_id),
  KEY idx_role     (role_type, role_ref_id),
  KEY idx_school_status (school_id, status),
  KEY idx_capture  (school_id, capture_status),
  KEY idx_card     (school_id, card_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

/**
 * Idempotently ensures the biometric_enrollments table is present with
 * the current (canonical) shape. Safe to call from any code path; the
 * first caller pays the cost, every subsequent caller resolves the
 * cached promise.
 */
export function ensureBiometricEnrollmentsSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      const shape = await detectInstalledShape();

      if (shape === 'old') {
        // OLD pipeline shape squatting on the canonical name. Rename —
        // never drop — then create canonical and backfill what we can.
        await query(
          `RENAME TABLE biometric_enrollments TO biometric_enrollments_legacy`,
          [],
        );
        console.log('[biometric-enrollments] OLD shape detected — renamed to biometric_enrollments_legacy');
      }

      await query(CANONICAL_CREATE, []);

      // Older canonical installs predate the pending_capture status.
      await ensurePendingCaptureStatus();

      // Phase 2 lifecycle columns for canonical installs created before
      // migration 003 (defensive fallback — the migration runner is the
      // production strategy). TiDB supports ADD COLUMN IF NOT EXISTS.
      for (const ddl of [
        `ALTER TABLE biometric_enrollments ADD COLUMN IF NOT EXISTS capture_status VARCHAR(24) NOT NULL DEFAULT 'not_requested'`,
        `ALTER TABLE biometric_enrollments ADD COLUMN IF NOT EXISTS captured_at DATETIME DEFAULT NULL`,
        `ALTER TABLE biometric_enrollments ADD COLUMN IF NOT EXISTS last_seen_on_device_at DATETIME DEFAULT NULL`,
        `ALTER TABLE biometric_enrollments ADD COLUMN IF NOT EXISTS updated_by BIGINT DEFAULT NULL`,
      ]) {
        try { await query(ddl, []); } catch { /* duplicate column on MySQL — fine */ }
      }

      if (shape === 'old') {
        // One-shot, best-effort: bring resolvable legacy rows across.
        // Unresolvable rows stay in biometric_enrollments_legacy for
        // manual reconciliation — we never invent person mappings.
        await backfillFromRenamedLegacy().catch((err) =>
          console.warn('[biometric-enrollments] legacy backfill failed (rows remain in biometric_enrollments_legacy):', err),
        );
      }
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

type InstalledShape = 'absent' | 'canonical' | 'old';

async function detectInstalledShape(): Promise<InstalledShape> {
  const rows = (await query(
    `SELECT COLUMN_NAME
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'biometric_enrollments'`,
    [],
  )) as Array<{ COLUMN_NAME: string }>;
  if (rows.length === 0) return 'absent';
  const cols = new Set(rows.map(r => r.COLUMN_NAME.toLowerCase()));
  return cols.has('pin_value') ? 'canonical' : 'old';
}

/** Extend the status enum with 'pending_capture' on pre-existing
 *  canonical installs. Existing values are preserved by MODIFY. */
async function ensurePendingCaptureStatus(): Promise<void> {
  try {
    const rows = (await query(
      `SELECT COLUMN_TYPE
         FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'biometric_enrollments'
          AND COLUMN_NAME = 'status'`,
      [],
    )) as Array<{ COLUMN_TYPE: string }>;
    const colType = rows[0]?.COLUMN_TYPE ?? '';
    if (colType && !colType.includes('pending_capture')) {
      await query(
        `ALTER TABLE biometric_enrollments
           MODIFY status ENUM('active','pending_capture','suspended','revoked','transferred')
           NOT NULL DEFAULT 'active'`,
        [],
      );
    }
  } catch (err) {
    console.warn('[biometric-enrollments] pending_capture enum ensure failed:', err);
  }
}

/**
 * Copy resolvable rows from the renamed OLD-shape table into the
 * canonical table. OLD rows carry (school_id, device_sn, device_slot,
 * student_id, status). device_slot is the device PIN. Only rows whose
 * student resolves to a person are migrated; everything else stays in
 * biometric_enrollments_legacy untouched.
 */
async function backfillFromRenamedLegacy(): Promise<void> {
  const rows = (await query(
    `SELECT l.id, l.school_id, l.device_sn, l.device_slot, l.student_id, l.status,
            s.person_id
       FROM biometric_enrollments_legacy l
       LEFT JOIN students s ON s.id = l.student_id
      WHERE l.student_id IS NOT NULL
        AND l.device_slot IS NOT NULL
        AND l.status IN ('CAPTURED','ASSIGNED','VERIFIED')`,
    [],
  )) as Array<{
    id: number; school_id: number; device_sn: string | null;
    device_slot: number; student_id: number; status: string;
    person_id: number | null;
  }>;

  let migrated = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!r.person_id || !r.school_id) { skipped++; continue; }
    const pin = Number(r.device_slot);
    if (!Number.isFinite(pin) || pin <= 0 || pin > 65535) { skipped++; continue; }
    try {
      const ins = (await query(
        `INSERT IGNORE INTO biometric_enrollments
           (enrollment_uuid, school_id, person_id, role_type, role_ref_id,
            pin_value, status, origin_device_sn, legacy_source, legacy_id)
         VALUES (?, ?, ?, 'student', ?, ?, 'active', ?, 'be_legacy_pipeline', ?)`,
        [randomUUID(), r.school_id, r.person_id, r.student_id, pin, r.device_sn, r.id],
      )) as { affectedRows?: number };
      if ((ins.affectedRows ?? 0) > 0) migrated++; else skipped++;
    } catch {
      skipped++;
    }
  }
  console.log(`[biometric-enrollments] legacy pipeline backfill: migrated=${migrated} skipped=${skipped} of ${rows.length}`);
}
