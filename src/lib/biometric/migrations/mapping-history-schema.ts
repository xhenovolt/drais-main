/**
 * Biometric mapping history — append-only audit of every identity change
 * to a device PIN's canonical enrollment.
 *
 * WHY A SEPARATE TABLE
 * --------------------
 * biometric_enrollments has UNIQUE (school_id, pin_value): exactly one
 * row can ever exist per PIN, regardless of status. So a reassignment
 * MUST update that row in place — it cannot keep an old row alongside a
 * new one. To satisfy "never destroy historical mappings", every change
 * (map / reassign / unmap / revoke / suspend-on-archive / reactivate)
 * writes an immutable row here first. This is the source of truth for
 * "who was mapped to PIN 24 last month, and who changed it".
 *
 * Historical ATTENDANCE is unaffected by reassignment because
 * attendance_raw_events / attendance_records denormalize person_id +
 * role_type at punch time — old punches stay tied to the old person.
 */
import { query } from '@/lib/db';

let ensured: Promise<void> | null = null;

const CREATE = `CREATE TABLE IF NOT EXISTS biometric_mapping_history (
  id               BIGINT PRIMARY KEY AUTO_INCREMENT,
  school_id        BIGINT NOT NULL,
  enrollment_id    BIGINT DEFAULT NULL,
  device_sn        VARCHAR(64) DEFAULT NULL,
  pin_value        INT DEFAULT NULL,
  action           VARCHAR(32) NOT NULL,
  old_role_type    ENUM('student','staff','visitor') DEFAULT NULL,
  old_role_ref_id  BIGINT DEFAULT NULL,
  old_person_id    BIGINT DEFAULT NULL,
  new_role_type    ENUM('student','staff','visitor') DEFAULT NULL,
  new_role_ref_id  BIGINT DEFAULT NULL,
  new_person_id    BIGINT DEFAULT NULL,
  reason           VARCHAR(255) DEFAULT NULL,
  actor_user_id    BIGINT DEFAULT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_school_pin     (school_id, device_sn, pin_value),
  KEY idx_enrollment     (enrollment_id),
  KEY idx_school_created (school_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

/** Idempotent, cached ensure. First caller pays; the rest await it. */
export function ensureMappingHistorySchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    try {
      await query(CREATE, []);
    } catch (err) {
      ensured = null;
      throw err;
    }
  })();
  return ensured;
}
