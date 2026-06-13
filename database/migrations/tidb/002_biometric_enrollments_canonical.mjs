/**
 * 002 — biometric_enrollments shape-collision resolution.
 *
 * The audit found two incompatible shapes competing for this table
 * name. The TiDB Cloud preflight (2026-06-12) confirmed production
 * has the OLD pipeline shape (device_slot/student_id/session_id,
 * status INITIATED/…).
 *
 * Steps (all non-destructive):
 *   1. Detect installed shape via information_schema.
 *   2. OLD shape → RENAME TABLE biometric_enrollments TO
 *      biometric_enrollments_legacy (kept forever; rollback = rename
 *      back).
 *   3. CREATE the canonical table.
 *   4. Backfill canonical rows from:
 *        a. biometric_enrollments_legacy (CAPTURED/ASSIGNED/VERIFIED
 *           rows whose student resolves to a person),
 *        b. zk_user_mapping (the de-facto identity of the BIO era),
 *      tagging legacy_source/legacy_id. Rows that cannot be resolved
 *      safely are SKIPPED and reported — we never invent mappings.
 */
export default async function up({ query, log }) {
  const cols = await query(
    `SELECT COLUMN_NAME c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'biometric_enrollments'`,
  );
  const colSet = new Set(cols.map(r => r.c.toLowerCase()));
  const tableExists = colSet.size > 0;
  const isCanonical = colSet.has('pin_value');

  if (tableExists && !isCanonical) {
    const legacyExists = (await query(
      `SELECT COUNT(*) n FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = 'biometric_enrollments_legacy'`,
    ))[0].n > 0;
    if (legacyExists) {
      throw new Error('biometric_enrollments has OLD shape but biometric_enrollments_legacy already exists — manual review required before renaming');
    }
    await query(`RENAME TABLE biometric_enrollments TO biometric_enrollments_legacy`);
    log('OLD shape renamed to biometric_enrollments_legacy');
  } else if (tableExists) {
    log('canonical shape already installed — ensure-only');
  }

  await query(`CREATE TABLE IF NOT EXISTS biometric_enrollments (
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
    updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_enrollment_uuid (enrollment_uuid),
    UNIQUE KEY uk_school_pin       (school_id, pin_value),
    KEY idx_person   (person_id),
    KEY idx_role     (role_type, role_ref_id),
    KEY idx_school_status (school_id, status),
    KEY idx_card     (school_id, card_number)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

  // ── Backfill a: renamed legacy pipeline rows ─────────────────────────
  const legacyTable = (await query(
    `SELECT COUNT(*) n FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = 'biometric_enrollments_legacy'`,
  ))[0].n > 0;

  let fromPipeline = 0, fromMapping = 0, skipped = 0;

  if (legacyTable) {
    const rows = await query(
      `SELECT l.id, l.school_id, l.device_sn, l.device_slot, l.student_id,
              s.person_id
         FROM biometric_enrollments_legacy l
         LEFT JOIN students s ON s.id = l.student_id
        WHERE l.student_id IS NOT NULL
          AND l.device_slot IS NOT NULL
          AND l.status IN ('CAPTURED','ASSIGNED','VERIFIED')`,
    );
    for (const r of rows) {
      const pin = Number(r.device_slot);
      if (!r.person_id || !r.school_id || !Number.isFinite(pin) || pin <= 0 || pin > 65535) { skipped++; continue; }
      const ins = await query(
        `INSERT IGNORE INTO biometric_enrollments
           (enrollment_uuid, school_id, person_id, role_type, role_ref_id,
            pin_value, status, origin_device_sn, legacy_source, legacy_id)
         VALUES (UUID(), ?, ?, 'student', ?, ?, 'active', ?, 'be_legacy_pipeline', ?)`,
        [r.school_id, r.person_id, r.student_id, pin, r.device_sn, r.id],
      );
      if (ins.affectedRows > 0) fromPipeline++; else skipped++;
    }
  }

  // ── Backfill b0: fill zk_user_mapping.school_id where safely
  //    inferable BEFORE reading it, so NULL-school rows participate.
  //    (006 re-runs the same idempotent UPDATEs as a safety net.)
  for (const sql of [
    `UPDATE zk_user_mapping m JOIN devices d ON d.sn = m.device_sn
        SET m.school_id = d.school_id
      WHERE (m.school_id IS NULL OR m.school_id = 0) AND d.school_id IS NOT NULL`,
    `UPDATE zk_user_mapping m JOIN students s ON s.id = m.student_id
        SET m.school_id = s.school_id
      WHERE (m.school_id IS NULL OR m.school_id = 0) AND m.student_id IS NOT NULL`,
    `UPDATE zk_user_mapping m JOIN staff st ON st.id = m.staff_id
        SET m.school_id = st.school_id
      WHERE (m.school_id IS NULL OR m.school_id = 0) AND m.staff_id IS NOT NULL`,
  ]) {
    try { await query(sql); } catch (e) { log('school backfill step skipped:', e.message); }
  }

  // ── Backfill b: zk_user_mapping (numeric PINs with resolvable people) ─
  const mapRows = await query(
    `SELECT m.id, m.school_id, m.device_user_id, m.user_type,
            m.student_id, m.staff_id, m.device_sn, m.card_number,
            s.person_id AS student_person, st.person_id AS staff_person
       FROM zk_user_mapping m
       LEFT JOIN students s ON s.id = m.student_id
       LEFT JOIN staff st   ON st.id = m.staff_id
      WHERE (m.student_id IS NOT NULL OR m.staff_id IS NOT NULL)
        AND m.school_id IS NOT NULL AND m.school_id > 0`,
  );
  for (const r of mapRows) {
    const pin = Number(r.device_user_id);
    if (!Number.isFinite(pin) || pin <= 0 || pin > 65535) { skipped++; continue; }
    // Staff > student precedence (BIO-2) when a row carries both.
    const roleType = r.staff_id ? 'staff' : 'student';
    const roleRefId = r.staff_id ?? r.student_id;
    const personId = r.staff_id ? r.staff_person : r.student_person;
    if (!personId) { skipped++; continue; }
    const ins = await query(
      `INSERT IGNORE INTO biometric_enrollments
         (enrollment_uuid, school_id, person_id, role_type, role_ref_id,
          pin_value, card_number, status, origin_device_sn, legacy_source, legacy_id)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, 'active', ?, 'zk_user_mapping', ?)`,
      [r.school_id, personId, roleType, roleRefId, pin, r.card_number, r.device_sn, r.id],
    );
    if (ins.affectedRows > 0) fromMapping++; else skipped++;
  }

  log(`backfill: pipeline=${fromPipeline} zk_user_mapping=${fromMapping} skipped=${skipped}`);
  log('skipped rows remain in their source tables for manual reconciliation (never invented).');
}
