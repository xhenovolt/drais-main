/**
 * PIN allocator — Phase 1 rewrite.
 *
 * Allocates against the canonical biometric_enrollments table (UNIQUE
 * KEY uk_school_pin) and dual-writes to zk_user_mapping during the
 * Phase 1 migration window so legacy readers keep working.
 *
 * Why this matters
 * ----------------
 * The previous implementation (BIO-6) used INSERT IGNORE against
 * zk_user_mapping's UNIQUE(device_user_id) key per device. That fixed
 * the per-school PIN race within `zk_user_mapping`, but it could not
 * coordinate with sync-identities / enroll-fingerprint paths that
 * allocated via MAX+1 over a different scope (per-school vs global).
 * The forensic audit (Phase 9) confirmed observable collisions.
 *
 * The fix in Phase 1 is structural, not procedural: the allocator
 * INSERTs into biometric_enrollments which has UNIQUE(school_id,
 * pin_value). That key is enforced at the storage layer regardless
 * of how many call sites or processes are allocating concurrently.
 * The race is eliminated at the schema, not in the retry loop.
 *
 * Idempotency
 * -----------
 * A re-allocation of the same (school, role, ref_id) returns the
 * existing PIN instead of burning a new one. The audit's
 * "promoted-learner-gets-a-second-PIN-as-staff" case is preserved:
 * staff_id and student_id are different role_ref_ids on the same
 * person, so re-allocation for the new role correctly burns a new
 * PIN. The unified resolver's staff > student precedence (Phase 1
 * §2.4) makes the staff PIN win on the next scan.
 */
import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db';
import { ensureBiometricEnrollmentsSchema } from '@/lib/biometric/migrations/biometric-enrollments-schema';

export interface AllocateOptions {
  schoolId: number;
  deviceSn: string;
  userType: 'student' | 'staff';
  studentId?: number | null;
  staffId?:   number | null;
  /** Sanitized device-display name (already ASCII-clean). Used for
   *  logging context only. */
  name?: string;
}

export class PinExhaustedError extends Error {
  constructor() {
    super('Device PIN space exhausted (limit 65535).');
    this.name = 'PinExhaustedError';
  }
}

const HARD_CAP = 65535;

/**
 * Allocate the next free PIN for a (school, role) tuple and persist
 * the canonical enrollment. Returns the chosen PIN. Throws
 * PinExhaustedError when 65535 is hit.
 */
export async function allocatePin(opts: AllocateOptions): Promise<{ pin: number; created: boolean }> {
  const { schoolId, deviceSn, userType, studentId, staffId } = opts;
  if (!schoolId || !deviceSn) throw new Error('allocatePin: schoolId and deviceSn required');
  if (userType === 'student' && !studentId) throw new Error('allocatePin: studentId required for user_type=student');
  if (userType === 'staff'   && !staffId)   throw new Error('allocatePin: staffId required for user_type=staff');

  await ensureBiometricEnrollmentsSchema();

  const roleRefId = (userType === 'student' ? studentId : staffId) as number;

  // Resolve person_id from the role table. Required by the canonical
  // enrollment schema (every enrollment has a single person root).
  const personId = await resolvePersonIdForRole(userType, roleRefId);
  if (!personId) {
    throw new Error(`allocatePin: no person_id for ${userType} id=${roleRefId}`);
  }

  // 1. Idempotency — does this (school, role, ref_id) already have an
  //    active enrollment? Return its PIN.
  const existingCanonical = (await query(
    `SELECT pin_value
       FROM biometric_enrollments
      WHERE school_id   = ?
        AND role_type   = ?
        AND role_ref_id = ?
        AND status      = 'active'
      LIMIT 1`,
    [schoolId, userType, roleRefId],
  )) as Array<{ pin_value: number }>;
  if (existingCanonical.length > 0) {
    const pin = Number(existingCanonical[0].pin_value);
    if (Number.isFinite(pin) && pin > 0) {
      // Ensure the legacy mirror row exists too — defensive against
      // partial-write history.
      await mirrorToLegacyMapping(schoolId, deviceSn, pin, userType, studentId ?? null, staffId ?? null);
      return { pin, created: false };
    }
  }

  // 2. Compute starting hint from existing PINs in this school. The
  //    UNIQUE constraint on (school_id, pin_value) is what protects
  //    us; the hint just minimises retries.
  const maxRow = (await query(
    `SELECT COALESCE(MAX(pin_value), 0) AS m
       FROM biometric_enrollments
      WHERE school_id = ?`,
    [schoolId],
  )) as Array<{ m: number | string }>;
  let nextPin = Math.max(1, Number(maxRow[0]?.m ?? 0) + 1);

  // 3. INSERT IGNORE retry loop against the canonical UNIQUE constraint.
  for (let attempts = 0; attempts < HARD_CAP; attempts++) {
    if (nextPin > HARD_CAP) throw new PinExhaustedError();

    const ins = (await query(
      `INSERT IGNORE INTO biometric_enrollments
         (enrollment_uuid, school_id, person_id, role_type, role_ref_id,
          pin_value, status, origin_device_sn)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      [randomUUID(), schoolId, personId, userType, roleRefId, nextPin, deviceSn],
    )) as { affectedRows?: number };

    if ((ins.affectedRows ?? 0) > 0) {
      // 4. Mirror to legacy zk_user_mapping so unmigrated readers
      //    keep working. After Phase 1 cutover this call is removed
      //    along with the legacy table itself.
      await mirrorToLegacyMapping(schoolId, deviceSn, nextPin, userType, studentId ?? null, staffId ?? null);
      return { pin: nextPin, created: true };
    }

    // Lost the race against another concurrent allocator. Bump and retry.
    nextPin++;
  }
  throw new PinExhaustedError();
}

/** Find people.id for a student or staff record. */
async function resolvePersonIdForRole(
  role: 'student' | 'staff',
  refId: number,
): Promise<number | null> {
  const table = role === 'student' ? 'students' : 'staff';
  try {
    const rows = (await query(
      `SELECT person_id FROM ${table} WHERE id = ? LIMIT 1`,
      [refId],
    )) as Array<{ person_id: number }>;
    return rows[0]?.person_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Dual-write to zk_user_mapping. This is a transitional bridge: as
 * long as any reader in the codebase still consults zk_user_mapping
 * (including external admins running raw SQL on production), the
 * canonical and legacy rows must agree.
 *
 * INSERT ... ON DUPLICATE KEY UPDATE keeps the row idempotent without
 * touching the legacy UNIQUE shape (per BIO-6, it is the device_user_id
 * column that carries the UNIQUE constraint there).
 */
async function mirrorToLegacyMapping(
  schoolId: number,
  deviceSn: string,
  pin: number,
  userType: 'student' | 'staff',
  studentId: number | null,
  staffId: number | null,
): Promise<void> {
  try {
    await query(
      `INSERT INTO zk_user_mapping
         (school_id, device_user_id, user_type, student_id, staff_id, device_sn)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         student_id = COALESCE(VALUES(student_id), student_id),
         staff_id   = COALESCE(VALUES(staff_id),   staff_id),
         user_type  = VALUES(user_type),
         device_sn  = COALESCE(VALUES(device_sn),  device_sn),
         updated_at = CURRENT_TIMESTAMP`,
      [schoolId, String(pin), userType, studentId, staffId, deviceSn],
    );
  } catch {
    // Best-effort. A missing legacy table is fine post-cutover; pre-
    // cutover the table is always present and writes succeed.
  }
}
