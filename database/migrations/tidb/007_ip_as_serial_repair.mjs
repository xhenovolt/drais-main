/**
 * 007 — collision-safe repair of IP-as-serial mapping rows.
 *
 * The pre-refactor local TCP enroller stored the device LAN IP in
 * zk_user_mapping.device_sn (424 rows in production at audit time).
 * Repairing them to the real serial collides with UNIQUE
 * uk_device_user(device_user_id, device_sn) whenever a real-SN row for
 * the same PIN already exists (Phase 1 mirror writes created those) —
 * migration 006's blind UPDATE failed on exactly that.
 *
 * Strategy per IP-keyed row (school has exactly ONE registered device,
 * otherwise left for manual review):
 *   - real-SN row for (pin, sn) already exists:
 *       → fill its NULL student_id/staff_id from the IP row, then
 *         ARCHIVE the IP row by prefixing device_sn with
 *         'ip-archived:'. Nothing is hard-deleted (rollback rule); the
 *         archived row can never match resolution (resolver compares
 *         device_sn against real serials or NULL).
 *   - no real-SN row:
 *       → simple UPDATE of device_sn to the real serial.
 *
 * Also repairs canonical biometric_enrollments.origin_device_sn
 * (provenance only — identity is school_id + pin_value, so no unique
 * key is involved there).
 */
const IP_RE = String.raw`^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$`;

export default async function up({ query, log }) {
  // Map of school → its single registered device serial.
  const singles = await query(
    `SELECT school_id, MIN(sn) AS sn
       FROM devices
      WHERE deleted_at IS NULL AND sn IS NOT NULL
      GROUP BY school_id
     HAVING COUNT(*) = 1`,
  );
  const snBySchool = new Map(singles.map(r => [Number(r.school_id), r.sn]));

  const ipRows = await query(
    `SELECT id, school_id, device_user_id, user_type, student_id, staff_id, device_sn
       FROM zk_user_mapping
      WHERE device_sn REGEXP '${IP_RE}'`,
  );

  let repaired = 0, merged = 0, archived = 0, manual = 0;
  for (const row of ipRows) {
    const realSn = snBySchool.get(Number(row.school_id));
    if (!realSn) { manual++; continue; }

    const existing = await query(
      `SELECT id, student_id, staff_id FROM zk_user_mapping
        WHERE device_user_id = ? AND device_sn = ?
        LIMIT 1`,
      [row.device_user_id, realSn],
    );

    if (existing.length > 0) {
      const e = existing[0];
      await query(
        `UPDATE zk_user_mapping
            SET student_id = COALESCE(student_id, ?),
                staff_id   = COALESCE(staff_id, ?),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [row.student_id, row.staff_id, e.id],
      );
      await query(
        `UPDATE zk_user_mapping
            SET device_sn = CONCAT('ip-archived:', device_sn),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [row.id],
      );
      merged++; archived++;
    } else {
      await query(
        `UPDATE zk_user_mapping
            SET device_sn = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [realSn, row.id],
      );
      repaired++;
    }
  }
  log(`zk_user_mapping IP rows: repaired=${repaired} merged+archived=${merged} manual-review=${manual} of ${ipRows.length}`);

  // Provenance repair on canonical enrollments (no unique key risk).
  const prov = await query(
    `UPDATE biometric_enrollments be
     JOIN (
       SELECT school_id, MIN(sn) AS sn
         FROM devices
        WHERE deleted_at IS NULL AND sn IS NOT NULL
        GROUP BY school_id
       HAVING COUNT(*) = 1
     ) one ON one.school_id = be.school_id
     SET be.origin_device_sn = one.sn
     WHERE be.origin_device_sn REGEXP '${IP_RE}'`,
  );
  log(`biometric_enrollments origin_device_sn repaired: ${prov.affectedRows ?? 0}`);

  const remaining = await query(
    `SELECT COUNT(*) n FROM zk_user_mapping WHERE device_sn REGEXP '${IP_RE}'`,
  );
  log(`remaining IP-keyed mapping rows (multi-device schools, manual review): ${remaining[0].n}`);
}
