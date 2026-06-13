/**
 * Phase 1E — pending_device_users queue.
 *
 * Replaces the two unsafe behaviours the audit flagged in USERINFO
 * processing:
 *
 *   1. Phantom creation: an unknown device name used to silently
 *      CREATE real people + students rows. A misspelled device name
 *      forked a duplicate learner that then accrued attendance.
 *   2. Exact-name LIMIT 1 mapping: two learners sharing a name meant
 *      the lower id silently won the PIN forever.
 *
 * Now every device user that cannot be DETERMINISTICALLY mapped lands
 * here with status 'pending' (no candidate) or 'ambiguous' (multiple
 * candidates), carrying the device's own evidence (sn, pin, name,
 * card). An operator resolves each row via the API: map to an existing
 * learner/staff member, ignore, or quarantine. Mapping goes through
 * the enrollment service so the canonical row + legacy mirror are
 * written and prior unmatched punches are re-evaluated by the caller.
 *
 * UNIQUE(school_id, device_sn, device_user_pin) — re-seeing the same
 * device user refreshes the row instead of duplicating it.
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

export function ensurePendingDeviceUsersSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      await query(
        `CREATE TABLE IF NOT EXISTS pending_device_users (
           id               BIGINT PRIMARY KEY AUTO_INCREMENT,
           school_id        BIGINT DEFAULT NULL,
           device_sn        VARCHAR(100) NOT NULL,
           device_user_pin  VARCHAR(100) NOT NULL,
           device_name      VARCHAR(255) DEFAULT NULL,
           device_card      VARCHAR(64)  DEFAULT NULL,
           status           ENUM('pending','ambiguous','mapped','ignored','quarantined') NOT NULL DEFAULT 'pending',
           reason           VARCHAR(255) DEFAULT NULL,
           candidates_json  TEXT DEFAULT NULL,
           resolved_by      BIGINT DEFAULT NULL,
           resolved_at      DATETIME DEFAULT NULL,
           resolved_enrollment_id BIGINT DEFAULT NULL,
           first_seen       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
           last_seen        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
           UNIQUE KEY uk_pdu (school_id, device_sn, device_user_pin),
           KEY idx_pdu_status (school_id, status, last_seen)
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

export interface RecordPendingInput {
  schoolId: number | null;
  deviceSn: string;
  devicePin: string;
  deviceName?: string | null;
  deviceCard?: string | null;
  status: 'pending' | 'ambiguous';
  reason: string;
  /** Suggested candidates for the operator (serialised to JSON). */
  candidates?: unknown[] | null;
}

/**
 * Upsert a pending device user. Re-seeing the same (school, sn, pin)
 * refreshes last_seen + evidence but never un-resolves an already
 * mapped/ignored/quarantined row.
 */
export async function recordPendingDeviceUser(input: RecordPendingInput): Promise<void> {
  if (!input.deviceSn || !input.devicePin) return;
  try {
    await ensurePendingDeviceUsersSchema();
    await query(
      `INSERT INTO pending_device_users
         (school_id, device_sn, device_user_pin, device_name, device_card,
          status, reason, candidates_json, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         device_name = COALESCE(NULLIF(VALUES(device_name), ''), device_name),
         device_card = COALESCE(NULLIF(VALUES(device_card), ''), device_card),
         -- only refresh the triage state while the row is unresolved
         status = IF(status IN ('pending','ambiguous'), VALUES(status), status),
         reason = IF(status IN ('pending','ambiguous'), VALUES(reason), reason),
         candidates_json = IF(status IN ('pending','ambiguous'), VALUES(candidates_json), candidates_json),
         last_seen = NOW()`,
      [
        input.schoolId,
        input.deviceSn,
        String(input.devicePin),
        input.deviceName ?? null,
        input.deviceCard ?? null,
        input.status,
        input.reason.slice(0, 255),
        input.candidates && input.candidates.length > 0
          ? JSON.stringify(input.candidates).slice(0, 60000)
          : null,
      ],
    );
  } catch (err) {
    console.warn('[pending-device-users] record failed:', err);
  }
}

/** Mark a pending row resolved after a successful mapping. */
export async function markPendingResolved(
  schoolId: number,
  deviceSn: string,
  devicePin: string,
  outcome: 'mapped' | 'ignored' | 'quarantined',
  resolvedBy: number | null,
  enrollmentId?: number | null,
): Promise<void> {
  try {
    await ensurePendingDeviceUsersSchema();
    await query(
      `UPDATE pending_device_users
          SET status = ?, resolved_by = ?, resolved_at = NOW(),
              resolved_enrollment_id = ?
        WHERE school_id = ? AND device_sn = ? AND device_user_pin = ?`,
      [outcome, resolvedBy, enrollmentId ?? null, schoolId, deviceSn, String(devicePin)],
    );
  } catch (err) {
    console.warn('[pending-device-users] resolve failed:', err);
  }
}
