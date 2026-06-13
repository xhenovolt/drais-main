/**
 * 008 — archive IP-keyed mapping rows that cannot be auto-repaired.
 *
 * After 007, the only remaining IP-keyed zk_user_mapping rows belong
 * to schools with NO registered device (verified in production:
 * schools 12004 / 6 / 12011 — the K40s there never heartbeated to the
 * cloud, so there is no serial to repair against). Their identity is
 * already safe: migration 002 backfilled canonical
 * biometric_enrollments from these rows (identity = school + PIN,
 * device-agnostic).
 *
 * We ARCHIVE (prefix device_sn with 'ip-archived:'), never delete —
 * the IP hint stays visible for the admin who eventually registers
 * the device. Archived rows cannot match punch resolution.
 *
 * Canonical origin_device_sn that still holds an IP (same schools) is
 * set NULL: unknown provenance is truthful, an IP is misleading.
 */
const IP_RE = String.raw`^[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$`;

export default async function up({ query, log }) {
  const archived = await query(
    `UPDATE zk_user_mapping
        SET device_sn = CONCAT('ip-archived:', device_sn),
            updated_at = CURRENT_TIMESTAMP
      WHERE device_sn REGEXP '${IP_RE}'`,
  );
  log(`zk_user_mapping: archived ${archived.affectedRows ?? 0} unrepairable IP-keyed row(s)`);

  const prov = await query(
    `UPDATE biometric_enrollments
        SET origin_device_sn = NULL
      WHERE origin_device_sn REGEXP '${IP_RE}'`,
  );
  log(`biometric_enrollments: nulled ${prov.affectedRows ?? 0} IP provenance value(s)`);
}
