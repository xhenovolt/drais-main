import { query } from '@/lib/db';

/**
 * PHASE BIO-10 — single source of truth for the device-name directory.
 *
 * The directory exists so the live identity popup, the orphan-claim
 * queue, and the fuzzy auto-linker (BIO-9) can answer "what does the
 * device think this (sn, pin) is called?" — even when the PIN has no
 * formal zk_user_mapping yet.
 *
 * BIO-8 originally populated this directory from device-side pushes:
 * USERINFO records and OPERLOG USER lines. That covers PINs enrolled
 * directly on the device keypad. But for PINs that DRAIS enrolls
 * itself (via `DATA UPDATE USERINFO PIN=…\tName=…` commands), most
 * firmware just ACKs the command silently and never echoes a USER
 * record back. The directory stayed empty for those PINs, so the
 * popup said "Unrecognized ID" even though DRAIS had told the device
 * the name moments earlier.
 *
 * BIO-10 fixes that by also writing the directory at the queue site:
 * whenever an endpoint queues `DATA UPDATE USERINFO`, it calls this
 * helper with the same name it embedded in the command. The directory
 * now reflects DRAIS's intent, not just the device's echo.
 *
 * Idempotent — re-seeing the same (sn, pin) updates last_seen and the
 * name (so renames flow through). The table is created lazily so
 * fresh deployments work without a migration.
 */
export async function captureDeviceUserDirectory(
  deviceSn: string,
  deviceUserId: string,
  name: string,
  schoolId: number | null,
  extras: { card?: string; priv?: string } = {},
): Promise<void> {
  if (!deviceSn || !deviceUserId || !name) return;
  const cleanName = String(name).trim();
  if (!cleanName || cleanName.toLowerCase() === 'admin') return;

  try {
    await query(
      `CREATE TABLE IF NOT EXISTS device_user_directory (
         id              BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
         school_id       BIGINT       DEFAULT NULL,
         device_sn       VARCHAR(64)  NOT NULL,
         device_user_id  VARCHAR(64)  NOT NULL,
         device_name     VARCHAR(255) NOT NULL,
         device_card     VARCHAR(64)  DEFAULT NULL,
         device_priv     VARCHAR(8)   DEFAULT NULL,
         first_seen      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
         last_seen       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
         UNIQUE KEY uk_dud (device_sn, device_user_id),
         KEY idx_dud_name (device_name),
         KEY idx_dud_school (school_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      [],
    );
    await query(
      `INSERT INTO device_user_directory
         (school_id, device_sn, device_user_id, device_name, device_card, device_priv,
          first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         device_name = VALUES(device_name),
         device_card = COALESCE(NULLIF(VALUES(device_card), ''), device_card),
         device_priv = COALESCE(NULLIF(VALUES(device_priv), ''), device_priv),
         school_id   = COALESCE(VALUES(school_id), school_id),
         last_seen   = NOW()`,
      [schoolId, deviceSn, deviceUserId, cleanName, extras.card ?? null, extras.priv ?? null],
    );
  } catch (err) {
    // Best-effort. The popup's device_known_name lookup tolerates a
    // missing/failed row by simply falling back to the PIN-only
    // display. We swallow the error rather than failing the queue
    // operation that triggered us.
    console.warn('[device-directory] capture failed:', err);
  }
}
