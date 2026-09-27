/**
 * Face enrolment.
 *
 * ZKTeco face devices enrol a face on the device itself: DRAIS makes sure the person exists there (same PIN as
 * their fingerprints), asks the device to start a face capture (ENROLL_BIO, best-effort — some devices refuse it
 * remotely), and then recognises the face template when the device uploads it (BIODATA, TYPE 2/9). Only metadata
 * is stored (see migration 058); the template bytes are never kept.
 */
import { query } from '@/lib/db';
import { allocatePin, PinExhaustedError } from '@/lib/biometric/pin-allocator';
import { captureDeviceUserDirectory } from '@/lib/biometric/device-directory';

export type FaceRole = 'student' | 'staff';

let schemaReady: Promise<void> | null = null;
/** Defensive fallback so a deploy that lands before migration 058 still works. */
export function ensureFaceSchema(): Promise<void> {
  if (schemaReady) return schemaReady;
  schemaReady = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS biometric_face_enrollments (
         id            BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
         school_id     BIGINT NOT NULL,
         enrollment_id BIGINT NOT NULL,
         device_sn     VARCHAR(64) NOT NULL,
         requested_at  DATETIME DEFAULT NULL,
         command_id    BIGINT DEFAULT NULL,
         captured_at   DATETIME DEFAULT NULL,
         template_size INT DEFAULT NULL,
         bio_type      VARCHAR(4) DEFAULT NULL,
         created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         UNIQUE KEY uk_face_enrollment_device (enrollment_id, device_sn),
         KEY idx_face_school (school_id, captured_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
    ).catch(() => undefined);
  })();
  return schemaReady;
}

/** A face template arrived from the device: remember that (metadata only). */
export async function recordFaceCaptured(p: {
  schoolId: number; enrollmentId: number; deviceSn: string; size: number; bioType: string | null;
}): Promise<void> {
  await ensureFaceSchema();
  await query(
    `INSERT INTO biometric_face_enrollments (school_id, enrollment_id, device_sn, captured_at, template_size, bio_type)
     VALUES (?, ?, ?, NOW(), ?, ?)
     ON DUPLICATE KEY UPDATE captured_at = NOW(), template_size = VALUES(template_size), bio_type = VALUES(bio_type)`,
    [p.schoolId, p.enrollmentId, p.deviceSn, p.size || null, p.bioType],
  );
}

export interface FaceStatus { captured: boolean; requested: boolean; deviceSn: string | null; capturedAt: string | null }

export async function getFaceStatuses(schoolId: number, roleType: FaceRole, refIds?: number[]): Promise<Map<number, FaceStatus>> {
  const out = new Map<number, FaceStatus>();
  if (!schoolId || (refIds && refIds.length === 0)) return out;
  await ensureFaceSchema();
  const idFilter = refIds ? `AND be.role_ref_id IN (${refIds.map(() => '?').join(',')})` : '';
  try {
    const rows = (await query(
      `SELECT be.role_ref_id, f.device_sn, f.requested_at, f.captured_at
         FROM biometric_face_enrollments f
         JOIN biometric_enrollments be ON be.id = f.enrollment_id
        WHERE f.school_id = ? AND be.role_type = ? ${idFilter}
        ORDER BY f.captured_at IS NULL, f.captured_at DESC`,
      [schoolId, roleType, ...(refIds ?? [])],
    )) as any[];
    for (const r of rows) {
      const id = Number(r.role_ref_id);
      const prev = out.get(id);
      const captured = !!r.captured_at;
      if (prev?.captured) continue;
      out.set(id, { captured, requested: !!r.requested_at, deviceSn: r.device_sn ?? null, capturedAt: r.captured_at ?? null });
    }
  } catch { /* table optional until migrated */ }
  return out;
}

/** ADMS command that asks a device to start a face capture for this PIN (TYPE 9 = visible-light face). */
export const faceEnrollCommand = (pin: number): string => `ENROLL_BIO PIN=${pin}\tTYPE=9\tNO=0\tRETRY=3\tOVERWRITE=1`;

const zkName = (first: string, last: string): string => {
  const ascii = `${first || ''} ${last || ''}`.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '').replace(/[\t\r\n]/g, ' ').replace(/\s+/g, ' ').trim();
  return ascii.slice(0, 24) || 'Unknown';
};

export interface QueueFaceResult {
  ok: boolean; status?: number; error?: string;
  pin?: number; name?: string; identityCommandId?: number | null; faceCommandId?: number | null; alreadyQueued?: boolean;
}

/**
 * Get a learner or staff member ready for face capture on an ADMS device: make sure they exist on it
 * (same PIN as their fingerprints), then queue the face-capture request. Never touches their fingerprints.
 */
export async function queueFaceEnrollment(p: {
  schoolId: number; userId: number | null; roleType: FaceRole; refId: number; deviceSn: string;
}): Promise<QueueFaceResult> {
  const { schoolId, roleType, refId, deviceSn } = p;
  const dev = ((await query('SELECT id, sn, school_id FROM devices WHERE sn = ? LIMIT 1', [deviceSn])) as any[])[0];
  if (!dev) return { ok: false, status: 404, error: 'Device not found' };
  const deviceSchoolId = Number(dev.school_id || schoolId);

  const person = ((await query(
    roleType === 'student'
      ? `SELECT p.first_name, p.last_name FROM students s JOIN people p ON s.person_id = p.id AND p.deleted_at IS NULL
          WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL LIMIT 1`
      : `SELECT p.first_name, p.last_name FROM staff s JOIN people p ON s.person_id = p.id
          WHERE s.id = ? AND s.school_id = ? LIMIT 1`,
    [refId, schoolId],
  )) as any[])[0];
  if (!person) return { ok: false, status: 404, error: roleType === 'student' ? 'Student not found' : 'Staff not found' };
  const name = zkName(person.first_name, person.last_name);

  let pin: number;
  try {
    const allocated = await allocatePin({
      schoolId: deviceSchoolId, deviceSn, userType: roleType,
      ...(roleType === 'student' ? { studentId: refId } : { staffId: refId }),
    });
    pin = allocated.pin;
  } catch (e) {
    if (e instanceof PinExhaustedError) return { ok: false, status: 400, error: 'PIN limit reached (65535). Cannot assign more users.' };
    throw e;
  }

  // 1. Make sure the person exists on the device (idempotent; skipped when one is already waiting).
  let identityCommandId: number | null = null;
  const waiting = ((await query(
    `SELECT id FROM zk_device_commands WHERE device_sn = ? AND command LIKE ? AND status IN ('pending','sent') LIMIT 1`,
    [deviceSn, `DATA UPDATE USERINFO PIN=${pin}%`],
  )) as any[])[0];
  if (waiting) identityCommandId = Number(waiting.id);
  else {
    const ins = (await query(
      `INSERT INTO zk_device_commands (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
       VALUES (?, ?, ?, 5, 5, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)`,
      [deviceSchoolId, deviceSn, `DATA UPDATE USERINFO PIN=${pin}\tName=${name}\tPri=0\tPasswd=\tCard=\tGrp=0\tTZ=0000000100000000`, p.userId],
    )) as any;
    identityCommandId = Number(ins?.insertId) || null;
  }
  await captureDeviceUserDirectory(deviceSn, String(pin), name, deviceSchoolId);

  // 2. Ask the device to start the face capture. Commands go out highest priority first, so this one (4) follows
  //    the identity push (5): the person must exist on the device before a face can be captured for them.
  let faceCommandId: number | null = null;
  let alreadyQueued = false;
  const faceWaiting = ((await query(
    `SELECT id FROM zk_device_commands WHERE device_sn = ? AND command LIKE ? AND status IN ('pending','sent') LIMIT 1`,
    [deviceSn, `ENROLL_BIO PIN=${pin}\t%`],
  )) as any[])[0];
  if (faceWaiting) { faceCommandId = Number(faceWaiting.id); alreadyQueued = true; }
  else {
    const ins = (await query(
      `INSERT INTO zk_device_commands (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
       VALUES (?, ?, ?, 4, 1, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)`,
      [deviceSchoolId, deviceSn, faceEnrollCommand(pin), p.userId],
    )) as any;
    faceCommandId = Number(ins?.insertId) || null;
  }

  // 3. Remember that a face was requested (shown as "waiting" until the template arrives).
  await ensureFaceSchema();
  const enr = ((await query(
    `SELECT id FROM biometric_enrollments WHERE school_id = ? AND role_type = ? AND role_ref_id = ? AND status IN ('active','pending_capture') LIMIT 1`,
    [deviceSchoolId, roleType, refId],
  )) as any[])[0];
  if (enr) {
    await query(
      `INSERT INTO biometric_face_enrollments (school_id, enrollment_id, device_sn, requested_at, command_id)
       VALUES (?, ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE requested_at = NOW(), command_id = VALUES(command_id)`,
      [deviceSchoolId, Number(enr.id), deviceSn, faceCommandId],
    ).catch(() => undefined);
  }

  return { ok: true, pin, name, identityCommandId, faceCommandId, alreadyQueued };
}
