/**
 * Phase 1 — unified identity resolver.
 *
 * Replaces the three-table fallback chain (zk_user_mapping →
 * device_user_mappings → device_users) with a single deterministic
 * lookup against the canonical biometric_enrollments table.
 *
 * Dual-read strategy
 * ------------------
 * During the migration window, this resolver:
 *   1. Reads biometric_enrollments first (the canonical source).
 *   2. If miss AND `dual_read` is enabled, falls back to the legacy
 *      three-table chain so unmigrated schools keep working.
 *   3. Records which path produced the answer (so we can measure the
 *      mismatch rate per school and decide when to flip dual_read off
 *      for that school).
 *
 * After every school's mismatch rate is <0.1% over 7 days, dual_read
 * is disabled per-school via school_settings and the legacy tables
 * become read-only (then dropped in Phase 1 cutover).
 *
 * Precedence rules (staff > student)
 * ----------------------------------
 * BIO-2 established that staff outranks student when both rows exist
 * for the same device_user_id. biometric_enrollments enforces this
 * structurally: ONE active enrollment per (school_id, pin_value).
 * Promotion ceremony (Phase 2) revokes the student enrollment and
 * creates a fresh staff enrollment; until that happens, the existing
 * student enrollment remains active and the resolver returns it. The
 * staff > student decision is made at enrollment time, not at scan
 * time.
 *
 * School-scope guard (BIO-5)
 * --------------------------
 * Every read is school-scoped. Cross-school lookups are rejected at
 * the SQL layer. The schoolId comes from the device row (zk-handler's
 * upsert path or the SSE listener's session). A NULL schoolId on
 * either side is treated as a miss — we never attribute a punch to a
 * different school.
 */
import { query } from '@/lib/db';
import { ensureBiometricEnrollmentsSchema } from '@/lib/biometric/migrations/biometric-enrollments-schema';
import { upsertEnrollment } from '@/lib/biometric/enrollment-service';

export interface ResolveInput {
  schoolId: number;
  deviceSn: string;
  deviceUserId: string;
}

export type ResolutionPath =
  | 'enrollments'           // hit on biometric_enrollments (canonical)
  | 'legacy_zk'             // fell through to zk_user_mapping
  | 'legacy_dum'            // fell through to device_user_mappings
  | 'legacy_du'             // fell through to device_users
  | 'unresolved';           // no row anywhere

export interface ResolutionResult {
  resolved: boolean;
  enrollmentId?: number;
  personId?: number;
  studentId: number | null;
  staffId: number | null;
  roleType?: 'student' | 'staff' | 'visitor';
  /** Forensic — which table the answer came from. */
  path: ResolutionPath;
  /** Whether the answer would have been the same on both paths.
   *  Populated only when dual-read produced a result; null otherwise.
   *  Used by the dual-read mismatch monitor. */
  dualReadAgreed?: boolean | null;
}

export interface ResolveOptions {
  /** When true, on a canonical miss we fall through to the legacy
   *  three-table chain. Default: true during migration. */
  legacyFallback?: boolean;
  /** When true (and legacyFallback is true), we ALSO query the legacy
   *  chain on a canonical hit, just to compare answers. Used to drive
   *  the per-school mismatch rate so an operator knows when it is
   *  safe to disable legacyFallback. Default: false (it doubles read
   *  cost). Enabled per school via school_settings. */
  measureMismatch?: boolean;
}

/**
 * Resolve a device's (sn, pin) to a DRAIS identity. Always returns a
 * shape compatible with the legacy {studentId, staffId, matched}
 * contract that zk-handler.resolveUser used, so call sites can
 * delegate without changing their downstream code.
 */
export async function resolveIdentity(
  input: ResolveInput,
  options: ResolveOptions = {},
): Promise<ResolutionResult> {
  const { schoolId, deviceSn, deviceUserId } = input;
  const legacyFallback = options.legacyFallback !== false; // default ON
  const measureMismatch = options.measureMismatch === true;

  // Sanity: every input field must be present. Missing schoolId is a
  // hard reject (BIO-5 school-scope guard) — we never attribute to a
  // school we cannot verify.
  if (!schoolId || !deviceSn || !deviceUserId) {
    return {
      resolved: false,
      studentId: null,
      staffId: null,
      path: 'unresolved',
    };
  }

  // 1. Canonical read.
  let canonical: ResolutionResult | null = null;
  try {
    await ensureBiometricEnrollmentsSchema();
    const rows = (await query(
      `SELECT id, person_id, role_type, role_ref_id
         FROM biometric_enrollments
        WHERE school_id = ?
          AND pin_value = ?
          AND status    = 'active'
        LIMIT 1`,
      [schoolId, Number(deviceUserId)],
    )) as Array<{
      id: number;
      person_id: number;
      role_type: 'student' | 'staff' | 'visitor';
      role_ref_id: number;
    }>;

    if (rows.length > 0) {
      const r = rows[0];
      canonical = {
        resolved: true,
        enrollmentId: r.id,
        personId: r.person_id,
        studentId: r.role_type === 'student' ? r.role_ref_id : null,
        staffId:   r.role_type === 'staff'   ? r.role_ref_id : null,
        roleType:  r.role_type,
        path: 'enrollments',
      };
    }
  } catch {
    // Canonical read failed (table missing in a sad deployment, DB
    // hiccup, etc.). Don't error — fall through to legacy if allowed.
    canonical = null;
  }

  // If canonical answered AND we don't need to measure, return now.
  if (canonical && !measureMismatch) {
    return canonical;
  }

  // 2. Legacy fallback / measurement.
  let legacy: ResolutionResult | null = null;
  if (legacyFallback || measureMismatch) {
    legacy = await legacyResolve(schoolId, deviceSn, deviceUserId);
  }

  if (canonical && legacy) {
    // Both answered — compare for mismatch monitoring.
    const agreed =
      canonical.studentId === legacy.studentId &&
      canonical.staffId   === legacy.staffId;
    return { ...canonical, dualReadAgreed: agreed };
  }
  if (canonical) return canonical;
  if (legacy && legacy.resolved) return legacy;

  return {
    resolved: false,
    studentId: null,
    staffId: null,
    path: 'unresolved',
  };
}

/**
 * Legacy three-table chain — kept here so the new resolver is the
 * single entry point. Phase 1D/1F changes vs the BIO-1..BIO-5 era:
 *
 *   - PERSON HYDRATION (1D): a legacy hit now resolves person_id from
 *     the students/staff row (school-scoped). This is what lets the
 *     attendance engine's `matched && personId` gate pass for punches
 *     resolved via zk_user_mapping et al — previously those punches
 *     never produced attendance_records.
 *   - STRICT SCHOOL SCOPE (1F): zk_user_mapping rows are only accepted
 *     when their school_id matches the device's school. Global
 *     (school_id IS NULL) rows are no longer used for attribution —
 *     migration 020 backfills school_id where it is safely inferable;
 *     anything left NULL stays unmatched and surfaces in the pending
 *     reconciliation queue instead of being guessed.
 *   - The hydration query itself is school-scoped, so a mapping that
 *     points at a student/staff row in a DIFFERENT school resolves to
 *     nothing rather than cross-attributing.
 *   - AUTO-PROMOTION: a hydrated legacy hit is promoted into canonical
 *     biometric_enrollments (best-effort, fire-and-forget) so the
 *     legacy path drains itself with use.
 */
async function legacyResolve(
  schoolId: number,
  deviceSn: string,
  deviceUserId: string,
): Promise<ResolutionResult> {
  type Hit = { source: ResolutionPath; studentId: number | null; staffId: number | null };
  const hits: Hit[] = [];

  // 1. zk_user_mapping — strict school scope (Phase 1F).
  try {
    const rows = (await query(
      `SELECT student_id, staff_id FROM zk_user_mapping
        WHERE device_user_id = ?
          AND (device_sn = ? OR device_sn IS NULL)
          AND school_id = ?
        LIMIT 1`,
      [deviceUserId, deviceSn, schoolId],
    )) as Array<{ student_id: number | null; staff_id: number | null }>;
    if (rows.length > 0) {
      hits.push({ source: 'legacy_zk', studentId: rows[0].student_id, staffId: rows[0].staff_id });
    }
  } catch { /* table missing or query failed — keep going */ }

  // 2. device_user_mappings — scoped via its own school_id column.
  try {
    const rows = (await query(
      `SELECT student_id, staff_id FROM device_user_mappings
        WHERE device_user_id = ? AND device_sn = ?
          AND (school_id = ? OR school_id IS NULL)
        LIMIT 1`,
      [deviceUserId, deviceSn, schoolId],
    )) as Array<{ student_id: number | null; staff_id: number | null }>;
    if (rows.length > 0) {
      hits.push({ source: 'legacy_dum', studentId: rows[0].student_id, staffId: rows[0].staff_id });
    }
  } catch { /* ignore */ }

  // 3. device_users (BIO-1 — accept both 'staff' and 'teacher')
  try {
    const rows = (await query(
      `SELECT person_type, person_id FROM device_users
        WHERE device_user_id = ? AND device_sn = ?
          AND (school_id = ? OR school_id IS NULL)
        LIMIT 1`,
      [deviceUserId, deviceSn, schoolId],
    )) as Array<{ person_type: string; person_id: number }>;
    if (rows.length > 0) {
      const t = (rows[0].person_type || '').toLowerCase();
      const isStaff = t === 'staff' || t === 'teacher';
      hits.push({
        source: 'legacy_du',
        studentId: isStaff ? null : rows[0].person_id,
        staffId:   isStaff ? rows[0].person_id : null,
      });
    }
  } catch { /* ignore */ }

  // Staff > Student precedence (BIO-2), then hydrate person_id (1D).
  const staffHit = hits.find(h => h.staffId !== null);
  const studentHit = hits.find(h => h.studentId !== null);

  if (staffHit && staffHit.staffId !== null) {
    const personId = await hydratePersonId('staff', staffHit.staffId, schoolId);
    if (personId) {
      promoteLegacyHitToCanonical(schoolId, deviceSn, deviceUserId, 'staff', staffHit.staffId, staffHit.source);
      return {
        resolved: true,
        studentId: null,
        staffId: staffHit.staffId,
        personId,
        roleType: 'staff',
        path: staffHit.source,
      };
    }
    // Mapping points at a staff row outside this school (or deleted) —
    // cross-school guard: do NOT attribute.
  }
  if (studentHit && studentHit.studentId !== null) {
    const personId = await hydratePersonId('student', studentHit.studentId, schoolId);
    if (personId) {
      promoteLegacyHitToCanonical(schoolId, deviceSn, deviceUserId, 'student', studentHit.studentId, studentHit.source);
      return {
        resolved: true,
        studentId: studentHit.studentId,
        staffId: null,
        personId,
        roleType: 'student',
        path: studentHit.source,
      };
    }
  }
  return {
    resolved: false,
    studentId: null,
    staffId: null,
    path: 'unresolved',
  };
}

/** Resolve people.id for a role row, school-scoped (cross-school
 *  mappings hydrate to nothing and are treated as unresolved). */
async function hydratePersonId(
  role: 'student' | 'staff',
  refId: number,
  schoolId: number,
): Promise<number | null> {
  const table = role === 'student' ? 'students' : 'staff';
  try {
    const rows = (await query(
      `SELECT person_id FROM ${table} WHERE id = ? AND school_id = ? LIMIT 1`,
      [refId, schoolId],
    )) as Array<{ person_id: number | null }>;
    return rows[0]?.person_id ?? null;
  } catch {
    return null;
  }
}

/**
 * Best-effort, fire-and-forget promotion of a legacy mapping hit into
 * canonical biometric_enrollments. Each promoted PIN stops hitting the
 * legacy chain on subsequent punches, so production converges on the
 * canonical path through normal use. PIN conflicts are logged by the
 * service and left for the operator — never forced.
 */
function promoteLegacyHitToCanonical(
  schoolId: number,
  deviceSn: string,
  deviceUserId: string,
  roleType: 'student' | 'staff',
  roleRefId: number,
  source: ResolutionPath,
): void {
  const pin = Number(deviceUserId);
  if (!Number.isFinite(pin) || pin <= 0 || pin > 65535) return;
  upsertEnrollment({
    schoolId,
    roleType,
    roleRefId,
    pin,
    deviceSn,
    source: `auto_promote:${source}`,
  }).catch(() => { /* logged inside the service */ });
}
