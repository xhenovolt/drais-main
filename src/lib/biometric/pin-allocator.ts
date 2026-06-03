/**
 * Phase BIO-6 — single, collision-safe PIN allocator.
 *
 * Background (Phase 9 of the forensic biometric audit):
 *   `sync-identities` allocated PINs as MAX(device_user_id) + 1 per
 *   school. `enroll-fingerprint` allocated PINs as MAX(device_user_id)
 *   + 1 GLOBALLY. Both wrote to zk_user_mapping. Adjacent calls under
 *   concurrent load could observe the same MAX value and INSERT
 *   duplicate PINs — the second INSERT lost on the UNIQUE key, or
 *   (worse) silently overwrote via ON DUPLICATE KEY UPDATE.
 *
 * This helper is the single source of truth for allocating the next
 * device_user_id for a (school, device_sn) tuple.
 *
 *   - Scope is per-school. Cross-school PIN reuse is allowed
 *     because devices are school-bound (resolveUser already enforces
 *     this in BIO-5).
 *   - Concurrency safety is achieved via a tight INSERT loop on the
 *     UNIQUE (device_user_id) key inside the mapping table itself,
 *     not via a separate row-level lock. INSERT IGNORE returns 0
 *     affected rows when another writer claimed the PIN first; we
 *     bump nextPin and try again. Bounded retry; the loop terminates
 *     within (highest existing PIN + max contenders) iterations.
 *   - The K40 family caps device_user_id at 65535. We refuse to
 *     allocate above that.
 *
 * The legacy MAX(...)+1 callers should migrate to this helper. While
 * the migration is in flight, the helper is safe to call alongside
 * the legacy code: the INSERT IGNORE retry loop will simply re-try
 * past any PIN the legacy code allocated first.
 */
import { query } from '@/lib/db';

export interface AllocateOptions {
  schoolId: number;
  deviceSn: string;
  /** Required so we write the binding to the right side of the row. */
  userType: 'student' | 'staff';
  studentId?: number | null;
  staffId?:   number | null;
  /** Pre-computed name string for the device — already passed through
   *  the zkName() ASCII sanitizer at the call site. Used for logging. */
  name?: string;
}

export class PinExhaustedError extends Error {
  constructor() {
    super('Device PIN space exhausted (limit 65535).');
    this.name = 'PinExhaustedError';
  }
}

/**
 * Allocate the next free device_user_id for a (school, device) tuple
 * and INSERT the zk_user_mapping row atomically. Returns the chosen
 * PIN. Throws PinExhaustedError when 65535 is hit.
 *
 * Idempotent against the (student_id, device_sn) or (staff_id,
 * device_sn) pair: a re-allocation of the same identity returns the
 * existing PIN instead of burning a new one. The audit's "promoted
 * learner gets a second PIN as staff" case is also addressed —
 * staff and student are NOT the same identity, so a staff
 * re-allocation when a student row exists for the same person still
 * burns a new PIN. The staff>student precedence rule (BIO-2) makes
 * the new staff PIN win at scan time.
 */
export async function allocatePin(opts: AllocateOptions): Promise<{ pin: number; created: boolean }> {
  const { schoolId, deviceSn, userType, studentId, staffId } = opts;
  if (!schoolId || !deviceSn) throw new Error('allocatePin: schoolId and deviceSn required');
  if (userType === 'student' && !studentId) throw new Error('allocatePin: studentId required for user_type=student');
  if (userType === 'staff'   && !staffId)   throw new Error('allocatePin: staffId required for user_type=staff');

  // 1. Idempotency check — is this identity already mapped on this
  //    device? Return that PIN.
  const existing = (await query(
    `SELECT device_user_id
       FROM zk_user_mapping
      WHERE school_id = ?
        AND device_sn = ?
        AND user_type = ?
        AND ${userType === 'student' ? 'student_id' : 'staff_id'} = ?
      LIMIT 1`,
    [schoolId, deviceSn, userType, userType === 'student' ? studentId : staffId],
  )) as Array<{ device_user_id: string }>;
  if (existing.length > 0) {
    const pin = Number(existing[0].device_user_id);
    if (Number.isFinite(pin) && pin > 0) {
      return { pin, created: false };
    }
  }

  // 2. Take the current MAX(device_user_id) for this device + school
  //    as a starting hint. Then INSERT IGNORE in a retry loop.
  const maxRow = (await query(
    `SELECT COALESCE(MAX(CAST(device_user_id AS UNSIGNED)), 0) AS m
       FROM zk_user_mapping
      WHERE school_id = ? AND (device_sn = ? OR device_sn IS NULL)`,
    [schoolId, deviceSn],
  )) as Array<{ m: number | string }>;
  let nextPin = Math.max(1, Number(maxRow[0]?.m ?? 0) + 1);

  // Reasonable bound. The K40 has 65535 max users; we cap retries
  // at that range so a runaway loop is impossible.
  const HARD_CAP = 65535;
  for (let attempts = 0; attempts < HARD_CAP; attempts++) {
    if (nextPin > HARD_CAP) throw new PinExhaustedError();

    // INSERT IGNORE: succeeds with affectedRows=1 when this PIN is
    // free for this device, returns 0 if the UNIQUE key collides.
    const ins = (await query(
      `INSERT IGNORE INTO zk_user_mapping
         (school_id, device_user_id, user_type, student_id, staff_id, device_sn)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [schoolId, String(nextPin), userType, studentId ?? null, staffId ?? null, deviceSn],
    )) as { affectedRows?: number };

    if ((ins.affectedRows ?? 0) > 0) {
      return { pin: nextPin, created: true };
    }

    // Lost the race — another writer (sync-identities or
    // enroll-fingerprint or a parallel allocator call) claimed this
    // PIN. Bump and try again.
    nextPin++;
  }
  throw new PinExhaustedError();
}
