/**
 * Phase 1 — acquisition backbone schema (runtime schema-ensure).
 *
 * Follows the house pattern of attendance-tables-schema.ts: idempotent
 * CREATE IF NOT EXISTS + best-effort ALTERs, gated by an in-process
 * promise. See docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md §7.
 *
 * Two tables:
 *   attendance_acquisitions        — one row per acquisition batch (any
 *                                    method: tcp_pull / adms_push / usb /
 *                                    csv / manual). The audit backbone.
 *   attendance_acquisition_records — staged raw punches for a batch. The
 *                                    device wall string is stored VERBATIM
 *                                    (VARCHAR, not DATETIME — it is a
 *                                    zone-less identity, not an instant).
 *
 * Also extends attendance_raw_events.source with acquisition method values
 * (additive enum extension; existing values preserved verbatim).
 *
 * NOTE: the legacy pull path keeps writing source='manual' until the
 * Phase 4 committer lands — switching it earlier would bypass dedup
 * against the Phase-0-repaired rows (uk includes source).
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

export function ensureAcquisitionSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS attendance_acquisitions (
         id                   BIGINT PRIMARY KEY AUTO_INCREMENT,
         school_id            BIGINT NOT NULL,
         device_sn            VARCHAR(64) DEFAULT NULL,
         device_ip            VARCHAR(45) DEFAULT NULL,
         method               ENUM('tcp_pull','adms_push','usb_import','csv_import','manual_entry') NOT NULL,
         status               ENUM('pulling','staged','validated','committed','discarded','failed') NOT NULL DEFAULT 'pulling',
         requested_by         BIGINT DEFAULT NULL,
         window_from          DATE DEFAULT NULL,
         window_to            DATE DEFAULT NULL,
         device_log_count     INT DEFAULT NULL,
         records_received     INT NOT NULL DEFAULT 0,
         records_staged       INT NOT NULL DEFAULT 0,
         records_committed    INT NOT NULL DEFAULT 0,
         records_duplicate    INT NOT NULL DEFAULT 0,
         records_unmatched    INT NOT NULL DEFAULT 0,
         records_failed       INT NOT NULL DEFAULT 0,
         device_time_at_pull  VARCHAR(19) DEFAULT NULL,
         server_time_at_pull  DATETIME DEFAULT NULL,
         clock_delta_seconds  INT DEFAULT NULL,
         duration_ms          INT DEFAULT NULL,
         error_message        TEXT DEFAULT NULL,
         warnings_json        TEXT DEFAULT NULL,
         started_at           DATETIME DEFAULT NULL,
         completed_at         DATETIME DEFAULT NULL,
         created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         KEY idx_school_created (school_id, created_at),
         KEY idx_device (device_sn, created_at),
         KEY idx_status (school_id, status)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      [],
    );

    await query(
      `CREATE TABLE IF NOT EXISTS attendance_acquisition_records (
         id                       BIGINT PRIMARY KEY AUTO_INCREMENT,
         acquisition_id           BIGINT NOT NULL,
         seq                      INT DEFAULT NULL,
         device_user_id           VARCHAR(32) NOT NULL,
         device_wall_time         VARCHAR(19) NOT NULL,
         verify_type              INT DEFAULT NULL,
         io_mode                  INT DEFAULT NULL,
         status_code              INT DEFAULT NULL,
         display_name             VARCHAR(191) DEFAULT NULL,
         matched                  BOOLEAN DEFAULT NULL,
         person_id                BIGINT DEFAULT NULL,
         role_type                VARCHAR(20) DEFAULT NULL,
         role_ref_id              BIGINT DEFAULT NULL,
         duplicate_of_event_id    BIGINT DEFAULT NULL,
         committed_event_id       BIGINT DEFAULT NULL,
         validation_flags         VARCHAR(255) DEFAULT NULL,
         raw_hex                  VARCHAR(160) DEFAULT NULL,
         created_at               TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         KEY idx_acquisition (acquisition_id, device_wall_time),
         KEY idx_pin (acquisition_id, device_user_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      [],
    );

    // Operator-driven time correction (Phase 5): DRAIS asks "what time is
    // on the device?" and "what is the real time?", stores both answers +
    // the derived drift, and keeps the corrected wall per record SEPARATE
    // from the verbatim device wall (which stays the dedup identity).
    for (const sql of [
      `ALTER TABLE attendance_acquisitions ADD COLUMN IF NOT EXISTS operator_device_wall VARCHAR(19) DEFAULT NULL`,
      `ALTER TABLE attendance_acquisitions ADD COLUMN IF NOT EXISTS operator_real_wall   VARCHAR(19) DEFAULT NULL`,
      `ALTER TABLE attendance_acquisitions ADD COLUMN IF NOT EXISTS operator_drift_seconds INT DEFAULT NULL`,
      `ALTER TABLE attendance_acquisitions ADD COLUMN IF NOT EXISTS correction_applied   BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE attendance_acquisition_records ADD COLUMN IF NOT EXISTS corrected_wall_time VARCHAR(19) DEFAULT NULL`,
    ]) {
      try { await query(sql, []); } catch { /* idempotent; ignore */ }
    }

    // Additive enum extension — full restatement required by MySQL/TiDB.
    // Existing values keep their positions; new methods appended.
    try {
      await query(
        `ALTER TABLE attendance_raw_events MODIFY COLUMN source
           ENUM('zkteco_push','dahua_pull','manual','relay','tcp_pull','usb_import','csv_import') NOT NULL`,
        [],
      );
    } catch { /* already extended, or engine forbids — staging still works */ }
  })();
  return ensured;
}
