/**
 * Phase 1C — unified biometric enrollment service.
 *
 * Single write path for the canonical identity model:
 *
 *     school_id + device_sn + device_user_pin
 *       → biometric_enrollments (person_id, role_type, role_ref_id)
 *
 * Every identity writer (auto-link, USERINFO processing, local TCP
 * enroll, sync-identities, the mapping UI, orphan claim) routes
 * through here instead of writing zk_user_mapping directly. The
 * service:
 *
 *   - resolves person_id from the student/staff row (school-scoped);
 *   - UPSERTs the canonical biometric_enrollments row;
 *   - mirrors to legacy zk_user_mapping during the transition window
 *     so unmigrated readers keep working;
 *   - refuses cross-school writes;
 *   - never silently rebinds a PIN that is actively held by a
 *     DIFFERENT person — that is a conflict the operator must resolve;
 *   - logs every decision so mapping changes are auditable.
 *
 * Name-only matching policy (Phase 1E) lives here too, as a PURE
 * function (decideNameMatchAction) so it is unit-testable and every
 * caller applies the same rule: a name may only create a permanent
 * mapping when the match is DETERMINISTIC — exactly one candidate at
 * full score with no plausible runner-up. Everything else becomes a
 * pending_device_users row for operator confirmation.
 */
import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db';
import { ensureBiometricEnrollmentsSchema } from '@/lib/biometric/migrations/biometric-enrollments-schema';
import { ensureMappingHistorySchema } from '@/lib/biometric/migrations/mapping-history-schema';

// Phase 1E name-match policy lives in its own pure module
// (name-match-policy.ts) so it is unit-testable without a DB; it is
// re-exported here because callers treat this service as the single
// entry point for identity decisions.
export {
  decideNameMatchAction,
  looksLikeIpAddress,
  DETERMINISTIC_MIN_SCORE,
  AMBIGUITY_RUNNER_UP_SCORE,
} from '@/lib/biometric/name-match-policy';
import { looksLikeIpAddress } from '@/lib/biometric/name-match-policy';

export type EnrollmentRole = 'student' | 'staff';
export type EnrollmentStatus = 'active' | 'pending_capture' | 'suspended' | 'revoked' | 'transferred';

/**
 * Phase 2G — capture pipeline state, orthogonal to the identity
 * `status`. The UI maps (status, capture_status) onto the human
 * lifecycle: INITIATED → DEVICE_COMMAND_QUEUED → DEVICE_COMMAND_SENT
 * → AWAITING_CAPTURE → TEMPLATE_RECEIVED → CAPTURED → ACTIVE, plus
 * FAILED / EXPIRED / REVOKED.
 */
export type CaptureStatus =
  | 'not_requested'
  | 'command_queued'
  | 'command_sent'
  | 'awaiting_capture'
  | 'template_received'
  | 'captured'
  | 'failed'
  | 'expired';

export interface UpsertEnrollmentInput {
  schoolId: number;
  roleType: EnrollmentRole;
  /** students.id or staff.id depending on roleType. */
  roleRefId: number;
  /** The device PIN (USER PIN). Must be a positive integer ≤ 65535. */
  pin: number;
  /** REAL device serial number (never an IP address). Optional —
   *  canonical identity is per-school, the SN is provenance. */
  deviceSn?: string | null;
  cardNumber?: string | null;
  status?: EnrollmentStatus;
  /** Capture pipeline state to stamp alongside the upsert (Phase 2G).
   *  Omitted → existing value is preserved / default 'not_requested'. */
  captureStatus?: CaptureStatus;
  /** Where this mapping came from — goes to legacy_source for audit. */
  source: string;
  enrolledBy?: number | null;
}

export interface UpsertEnrollmentResult {
  ok: boolean;
  /** Set when ok=true. */
  enrollmentId?: number;
  personId?: number;
  created?: boolean;
  pinReassigned?: boolean;
  /** Set when ok=false. */
  reason?: 'person_not_found' | 'pin_conflict' | 'invalid_input' | 'error';
  detail?: string;
  conflictEnrollmentId?: number;
}

function svcLog(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({
    ts: new Date().toISOString(), type: 'ENROLLMENT_SERVICE', event, ...data,
  }));
}

/**
 * Create or update the canonical enrollment for a (school, person-role,
 * PIN) binding. Idempotent: re-asserting an existing binding is a
 * no-op. A PIN held by a DIFFERENT person is a hard conflict.
 */
export async function upsertEnrollment(
  input: UpsertEnrollmentInput,
): Promise<UpsertEnrollmentResult> {
  const { schoolId, roleType, roleRefId, source } = input;
  const pin = Number(input.pin);
  const deviceSn = input.deviceSn?.trim() || null;
  const status: EnrollmentStatus = input.status ?? 'active';

  if (!schoolId || !roleRefId || !Number.isFinite(pin) || pin <= 0 || pin > 65535) {
    return { ok: false, reason: 'invalid_input', detail: `schoolId=${schoolId} roleRefId=${roleRefId} pin=${input.pin}` };
  }
  if (looksLikeIpAddress(deviceSn)) {
    // Refuse to persist an IP as a serial number — provenance without
    // an SN is better than poisoned provenance.
    svcLog('DEVICE_SN_LOOKS_LIKE_IP_DROPPED', { schoolId, pin, deviceSn });
    input.deviceSn = null;
  }
  const cleanSn = looksLikeIpAddress(deviceSn) ? null : deviceSn;

  try {
    await ensureBiometricEnrollmentsSchema();

    // 1. School-scoped person resolution. We never trust the caller's
    //    person id — the role row is the source of truth.
    const roleTable = roleType === 'student' ? 'students' : 'staff';
    const roleRows = (await query(
      `SELECT person_id FROM ${roleTable} WHERE id = ? AND school_id = ? LIMIT 1`,
      [roleRefId, schoolId],
    )) as Array<{ person_id: number | null }>;
    const personId = roleRows[0]?.person_id ?? null;
    if (!personId) {
      return { ok: false, reason: 'person_not_found', detail: `${roleType} id=${roleRefId} school=${schoolId}` };
    }

    // 2. Who holds this PIN right now?
    const holder = (await query(
      `SELECT id, person_id, role_type, role_ref_id, status
         FROM biometric_enrollments
        WHERE school_id = ? AND pin_value = ?
        LIMIT 1`,
      [schoolId, pin],
    )) as Array<{ id: number; person_id: number; role_type: string; role_ref_id: number; status: string }>;

    if (holder.length > 0) {
      const h = holder[0];
      const samePerson = Number(h.person_id) === Number(personId)
        && h.role_type === roleType
        && Number(h.role_ref_id) === Number(roleRefId);

      if (samePerson) {
        // Idempotent re-assert. Refresh provenance / revive if needed.
        if (h.status === 'revoked' || h.status === 'transferred' || h.status === 'suspended'
            || (h.status === 'pending_capture' && status === 'active')) {
          await query(
            `UPDATE biometric_enrollments
                SET status = ?, origin_device_sn = COALESCE(?, origin_device_sn),
                    card_number = COALESCE(?, card_number),
                    capture_status = COALESCE(?, capture_status),
                    revoked_at = NULL, revoked_reason = NULL,
                    updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [status, cleanSn, input.cardNumber ?? null, input.captureStatus ?? null, h.id],
          );
        } else if (input.captureStatus) {
          await query(
            `UPDATE biometric_enrollments
                SET capture_status = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ?`,
            [input.captureStatus, h.id],
          );
        }
        await mirrorToLegacyMapping(schoolId, cleanSn, pin, roleType, roleRefId, input.cardNumber ?? null);
        return { ok: true, enrollmentId: h.id, personId, created: false, pinReassigned: false };
      }

      if (h.status === 'active' || h.status === 'pending_capture') {
        // PIN actively held by someone else — NEVER silently rebind.
        svcLog('PIN_CONFLICT', { schoolId, pin, source, holderEnrollmentId: h.id, holderPersonId: h.person_id, wantedPersonId: personId });
        return { ok: false, reason: 'pin_conflict', conflictEnrollmentId: h.id, detail: `PIN ${pin} actively held by person ${h.person_id}` };
      }

      // PIN held by a revoked/transferred enrollment — safe to reassign.
      await query(
        `UPDATE biometric_enrollments
            SET person_id = ?, role_type = ?, role_ref_id = ?,
                status = ?, origin_device_sn = COALESCE(?, origin_device_sn),
                card_number = ?, enrolled_by = ?, enrolled_at = CURRENT_TIMESTAMP,
                capture_status = ?, captured_at = NULL,
                revoked_at = NULL, revoked_reason = NULL,
                legacy_source = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [personId, roleType, roleRefId, status, cleanSn,
         input.cardNumber ?? null, input.enrolledBy ?? null,
         input.captureStatus ?? 'not_requested', source, h.id],
      );
      await mirrorToLegacyMapping(schoolId, cleanSn, pin, roleType, roleRefId, input.cardNumber ?? null);
      svcLog('PIN_REASSIGNED_FROM_INACTIVE', { schoolId, pin, source, enrollmentId: h.id, personId });
      return { ok: true, enrollmentId: h.id, personId, created: false, pinReassigned: true };
    }

    // 3. Does this person-role already hold a DIFFERENT pin? A person
    //    has one active enrollment per role; a new PIN from the device
    //    (e.g. keypad re-enrollment) moves the enrollment to the new
    //    PIN rather than burning a second identity.
    const existingForPerson = (await query(
      `SELECT id, pin_value, status
         FROM biometric_enrollments
        WHERE school_id = ? AND role_type = ? AND role_ref_id = ?
          AND status IN ('active','pending_capture')
        LIMIT 1`,
      [schoolId, roleType, roleRefId],
    )) as Array<{ id: number; pin_value: number; status: string }>;

    if (existingForPerson.length > 0) {
      const e = existingForPerson[0];
      await query(
        `UPDATE biometric_enrollments
            SET pin_value = ?, status = ?,
                origin_device_sn = COALESCE(?, origin_device_sn),
                card_number = COALESCE(?, card_number),
                capture_status = COALESCE(?, capture_status),
                legacy_source = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?`,
        [pin, status, cleanSn, input.cardNumber ?? null,
         input.captureStatus ?? null, source, e.id],
      );
      await mirrorToLegacyMapping(schoolId, cleanSn, pin, roleType, roleRefId, input.cardNumber ?? null);
      svcLog('PIN_MOVED', { schoolId, source, enrollmentId: e.id, personId, oldPin: e.pin_value, newPin: pin });
      return { ok: true, enrollmentId: e.id, personId, created: false, pinReassigned: true };
    }

    // 4. Fresh enrollment.
    const ins = (await query(
      `INSERT IGNORE INTO biometric_enrollments
         (enrollment_uuid, school_id, person_id, role_type, role_ref_id,
          pin_value, card_number, status, capture_status, origin_device_sn, enrolled_by, legacy_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [randomUUID(), schoolId, personId, roleType, roleRefId,
       pin, input.cardNumber ?? null, status, input.captureStatus ?? 'not_requested',
       cleanSn, input.enrolledBy ?? null, source],
    )) as { insertId?: number; affectedRows?: number };

    if (!ins.insertId || (ins.affectedRows ?? 0) === 0) {
      // Lost a race — re-read and report as conflict for the caller.
      return { ok: false, reason: 'pin_conflict', detail: `concurrent insert for PIN ${pin}` };
    }

    await mirrorToLegacyMapping(schoolId, cleanSn, pin, roleType, roleRefId, input.cardNumber ?? null);
    svcLog('ENROLLMENT_CREATED', { schoolId, pin, source, enrollmentId: ins.insertId, personId, roleType, roleRefId, status });
    return { ok: true, enrollmentId: ins.insertId, personId, created: true, pinReassigned: false };
  } catch (err) {
    svcLog('ENROLLMENT_UPSERT_FAILED', { schoolId, pin, source, error: String(err) });
    return { ok: false, reason: 'error', detail: String(err) };
  }
}

/** Revoke an active enrollment (learner archived, wrong mapping, …). */
export async function revokeEnrollment(
  schoolId: number,
  enrollmentId: number,
  reason: string,
  revokedBy?: number | null,
): Promise<boolean> {
  try {
    const res = (await query(
      `UPDATE biometric_enrollments
          SET status = 'revoked', revoked_at = CURRENT_TIMESTAMP,
              revoked_reason = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND school_id = ? AND status IN ('active','pending_capture','suspended')`,
      [reason.slice(0, 255), enrollmentId, schoolId],
    )) as { affectedRows?: number };
    const ok = (res.affectedRows ?? 0) > 0;
    if (ok) svcLog('ENROLLMENT_REVOKED', { schoolId, enrollmentId, reason, revokedBy: revokedBy ?? null });
    return ok;
  } catch (err) {
    svcLog('ENROLLMENT_REVOKE_FAILED', { schoolId, enrollmentId, error: String(err) });
    return false;
  }
}

// ── Mapping lifecycle: history, reassign, unmap, archive cleanup ────────

export type MappingHistoryAction =
  | 'map' | 'reassign' | 'unmap' | 'revoke'
  | 'suspend_person_archived' | 'reactivate' | 'edit';

export interface MappingHistoryInput {
  schoolId: number;
  enrollmentId: number | null;
  deviceSn?: string | null;
  pin?: number | null;
  action: MappingHistoryAction;
  oldRoleType?: EnrollmentRole | 'visitor' | null;
  oldRoleRefId?: number | null;
  oldPersonId?: number | null;
  newRoleType?: EnrollmentRole | 'visitor' | null;
  newRoleRefId?: number | null;
  newPersonId?: number | null;
  reason?: string | null;
  actorUserId?: number | null;
}

/** Append one immutable row to biometric_mapping_history. Best-effort —
 *  history must never block the identity write it records. */
export async function recordMappingHistory(h: MappingHistoryInput): Promise<void> {
  try {
    await ensureMappingHistorySchema();
    await query(
      `INSERT INTO biometric_mapping_history
         (school_id, enrollment_id, device_sn, pin_value, action,
          old_role_type, old_role_ref_id, old_person_id,
          new_role_type, new_role_ref_id, new_person_id,
          reason, actor_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [h.schoolId, h.enrollmentId ?? null, h.deviceSn ?? null, h.pin ?? null, h.action,
       h.oldRoleType ?? null, h.oldRoleRefId ?? null, h.oldPersonId ?? null,
       h.newRoleType ?? null, h.newRoleRefId ?? null, h.newPersonId ?? null,
       h.reason ? h.reason.slice(0, 255) : null, h.actorUserId ?? null],
    );
  } catch (err) {
    svcLog('MAPPING_HISTORY_WRITE_FAILED', { schoolId: h.schoolId, action: h.action, error: String(err) });
  }
}

export interface ReassignResult {
  ok: boolean;
  enrollmentId?: number;
  oldPersonId?: number;
  newPersonId?: number;
  reason?: 'not_found' | 'person_not_found' | 'same_person' | 'error';
  detail?: string;
}

/**
 * Reassign an existing device PIN from its current person to a different
 * learner/staff. Because of uk_school_pin the SAME enrollment row is
 * updated in place (the PIN cannot move to a second row). History is
 * recorded BEFORE the mutation so the old binding is preserved. Old
 * attendance stays with the old person (it is denormalized at punch
 * time); only FUTURE scans resolve to the new person.
 */
export async function reassignEnrollment(input: {
  schoolId: number;
  enrollmentId: number;
  newRoleType: EnrollmentRole;
  newRoleRefId: number;
  reason?: string | null;
  actorUserId?: number | null;
}): Promise<ReassignResult> {
  const { schoolId, enrollmentId, newRoleType, newRoleRefId } = input;
  if (!schoolId || !enrollmentId || !['student', 'staff'].includes(newRoleType) || !newRoleRefId) {
    return { ok: false, reason: 'error', detail: 'invalid input' };
  }
  try {
    await ensureBiometricEnrollmentsSchema();

    // Current holder of this enrollment (school-scoped).
    const cur = (await query(
      `SELECT id, person_id, role_type, role_ref_id, pin_value, origin_device_sn, status
         FROM biometric_enrollments
        WHERE id = ? AND school_id = ? LIMIT 1`,
      [enrollmentId, schoolId],
    )) as Array<{ id: number; person_id: number; role_type: string; role_ref_id: number;
                  pin_value: number; origin_device_sn: string | null; status: string }>;
    if (cur.length === 0) return { ok: false, reason: 'not_found', detail: `enrollment ${enrollmentId}` };
    const c = cur[0];

    // Resolve the new person from the role row — school-scoped AND must
    // not be soft-deleted (never reassign to an archived identity).
    const roleTable = newRoleType === 'student' ? 'students' : 'staff';
    const roleRows = (await query(
      `SELECT person_id FROM ${roleTable}
        WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
      [newRoleRefId, schoolId],
    )) as Array<{ person_id: number | null }>;
    const newPersonId = roleRows[0]?.person_id ?? null;
    if (!newPersonId) {
      return { ok: false, reason: 'person_not_found', detail: `${newRoleType} id=${newRoleRefId} (missing or archived)` };
    }

    if (Number(c.person_id) === Number(newPersonId) && c.role_type === newRoleType
        && Number(c.role_ref_id) === Number(newRoleRefId)) {
      return { ok: false, reason: 'same_person', detail: 'target is already the mapped person' };
    }

    // 1. History FIRST (preserve the old binding).
    await recordMappingHistory({
      schoolId, enrollmentId: c.id, deviceSn: c.origin_device_sn, pin: c.pin_value,
      action: 'reassign',
      oldRoleType: c.role_type as any, oldRoleRefId: c.role_ref_id, oldPersonId: c.person_id,
      newRoleType, newRoleRefId, newPersonId,
      reason: input.reason ?? null, actorUserId: input.actorUserId ?? null,
    });

    // 2. Update the row in place — same PIN, new identity, active.
    await query(
      `UPDATE biometric_enrollments
          SET person_id = ?, role_type = ?, role_ref_id = ?,
              status = 'active', revoked_at = NULL, revoked_reason = NULL,
              enrolled_by = COALESCE(?, enrolled_by), enrolled_at = CURRENT_TIMESTAMP,
              updated_by = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND school_id = ?`,
      [newPersonId, newRoleType, newRoleRefId, input.actorUserId ?? null,
       input.actorUserId ?? null, c.id, schoolId],
    );
    await mirrorToLegacyMapping(schoolId, c.origin_device_sn, c.pin_value, newRoleType, newRoleRefId, null);
    svcLog('ENROLLMENT_REASSIGNED', {
      schoolId, enrollmentId: c.id, pin: c.pin_value,
      from: `${c.role_type}#${c.role_ref_id}`, to: `${newRoleType}#${newRoleRefId}`,
    });
    return { ok: true, enrollmentId: c.id, oldPersonId: c.person_id, newPersonId };
  } catch (err) {
    svcLog('ENROLLMENT_REASSIGN_FAILED', { schoolId, enrollmentId, error: String(err) });
    return { ok: false, reason: 'error', detail: String(err) };
  }
}

/**
 * Unmap (release) a PIN: revoke the enrollment so the resolver stops
 * recognising it, and record history. The PIN then shows as unmapped in
 * reconciliation again. Historical attendance is preserved.
 */
export async function unmapEnrollment(input: {
  schoolId: number;
  enrollmentId: number;
  reason?: string | null;
  actorUserId?: number | null;
}): Promise<{ ok: boolean; pin?: number; detail?: string }> {
  const { schoolId, enrollmentId } = input;
  try {
    await ensureBiometricEnrollmentsSchema();
    const cur = (await query(
      `SELECT id, person_id, role_type, role_ref_id, pin_value, origin_device_sn
         FROM biometric_enrollments WHERE id = ? AND school_id = ? LIMIT 1`,
      [enrollmentId, schoolId],
    )) as Array<{ id: number; person_id: number; role_type: string; role_ref_id: number;
                  pin_value: number; origin_device_sn: string | null }>;
    if (cur.length === 0) return { ok: false, detail: 'not found' };
    const c = cur[0];

    const ok = await revokeEnrollment(schoolId, enrollmentId, input.reason || 'unmapped by operator', input.actorUserId);
    await recordMappingHistory({
      schoolId, enrollmentId: c.id, deviceSn: c.origin_device_sn, pin: c.pin_value,
      action: 'unmap',
      oldRoleType: c.role_type as any, oldRoleRefId: c.role_ref_id, oldPersonId: c.person_id,
      reason: input.reason ?? 'unmapped by operator', actorUserId: input.actorUserId ?? null,
    });
    // Drop the legacy mirror row so legacy readers also stop resolving it.
    try {
      await query(
        `DELETE FROM zk_user_mapping WHERE school_id = ? AND device_user_id = ?`,
        [schoolId, String(c.pin_value)],
      );
    } catch { /* legacy table may be gone post-cutover */ }
    return { ok, pin: c.pin_value };
  } catch (err) {
    svcLog('ENROLLMENT_UNMAP_FAILED', { schoolId, enrollmentId, error: String(err) });
    return { ok: false, detail: String(err) };
  }
}

/**
 * Deactivate (suspend) every active enrollment for a role row — called
 * when a learner/staff is archived so the device stops recognising them
 * as a normal identity. We SUSPEND (not revoke) so a restore can cleanly
 * reactivate. Returns the number of enrollments affected.
 */
export async function suspendEnrollmentsForRole(
  schoolId: number,
  roleType: EnrollmentRole,
  roleRefId: number,
  reason: string,
  actorUserId?: number | null,
): Promise<number> {
  try {
    await ensureBiometricEnrollmentsSchema();
    const rows = (await query(
      `SELECT id, person_id, pin_value, origin_device_sn
         FROM biometric_enrollments
        WHERE school_id = ? AND role_type = ? AND role_ref_id = ?
          AND status IN ('active','pending_capture')`,
      [schoolId, roleType, roleRefId],
    )) as Array<{ id: number; person_id: number; pin_value: number; origin_device_sn: string | null }>;
    for (const r of rows) {
      await query(
        `UPDATE biometric_enrollments
            SET status = 'suspended', revoked_reason = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND school_id = ?`,
        [reason.slice(0, 255), actorUserId ?? null, r.id, schoolId],
      );
      await recordMappingHistory({
        schoolId, enrollmentId: r.id, deviceSn: r.origin_device_sn, pin: r.pin_value,
        action: 'suspend_person_archived',
        oldRoleType: roleType, oldRoleRefId: roleRefId, oldPersonId: r.person_id,
        reason, actorUserId: actorUserId ?? null,
      });
    }
    if (rows.length) svcLog('ENROLLMENTS_SUSPENDED_ON_ARCHIVE', { schoolId, roleType, roleRefId, count: rows.length });
    return rows.length;
  } catch (err) {
    svcLog('ENROLLMENTS_SUSPEND_FAILED', { schoolId, roleType, roleRefId, error: String(err) });
    return 0;
  }
}

/**
 * Reactivate enrollments that were suspended by archiving this exact role
 * row (reason marker 'person_archived'). Called on restore. Only revives
 * rows still suspended for that reason — never touches operator revokes
 * or reassigned rows.
 */
export async function reactivateEnrollmentsForRole(
  schoolId: number,
  roleType: EnrollmentRole,
  roleRefId: number,
  actorUserId?: number | null,
): Promise<number> {
  try {
    await ensureBiometricEnrollmentsSchema();
    const rows = (await query(
      `SELECT id, person_id, pin_value, origin_device_sn
         FROM biometric_enrollments
        WHERE school_id = ? AND role_type = ? AND role_ref_id = ?
          AND status = 'suspended' AND revoked_reason = 'person_archived'`,
      [schoolId, roleType, roleRefId],
    )) as Array<{ id: number; person_id: number; pin_value: number; origin_device_sn: string | null }>;
    for (const r of rows) {
      await query(
        `UPDATE biometric_enrollments
            SET status = 'active', revoked_reason = NULL, updated_by = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND school_id = ?`,
        [actorUserId ?? null, r.id, schoolId],
      );
      await recordMappingHistory({
        schoolId, enrollmentId: r.id, deviceSn: r.origin_device_sn, pin: r.pin_value,
        action: 'reactivate',
        newRoleType: roleType, newRoleRefId: roleRefId, newPersonId: r.person_id,
        reason: 'person restored from trash', actorUserId: actorUserId ?? null,
      });
    }
    if (rows.length) svcLog('ENROLLMENTS_REACTIVATED_ON_RESTORE', { schoolId, roleType, roleRefId, count: rows.length });
    return rows.length;
  } catch (err) {
    svcLog('ENROLLMENTS_REACTIVATE_FAILED', { schoolId, roleType, roleRefId, error: String(err) });
    return 0;
  }
}

/**
 * Transitional mirror to zk_user_mapping so legacy readers (and ops
 * running raw SQL) keep seeing the binding. Removed at Phase 1 cutover.
 */
async function mirrorToLegacyMapping(
  schoolId: number,
  deviceSn: string | null,
  pin: number,
  roleType: EnrollmentRole,
  roleRefId: number,
  cardNumber: string | null,
): Promise<void> {
  try {
    await query(
      `INSERT INTO zk_user_mapping
         (school_id, device_user_id, user_type, student_id, staff_id, device_sn, card_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         school_id  = VALUES(school_id),
         user_type  = VALUES(user_type),
         student_id = VALUES(student_id),
         staff_id   = VALUES(staff_id),
         device_sn  = COALESCE(VALUES(device_sn), device_sn),
         card_number = COALESCE(VALUES(card_number), card_number),
         updated_at = CURRENT_TIMESTAMP`,
      [schoolId, String(pin), roleType,
       roleType === 'student' ? roleRefId : null,
       roleType === 'staff' ? roleRefId : null,
       deviceSn, cardNumber],
    );
  } catch {
    // Best-effort: a missing legacy table is fine post-cutover.
  }
}


/**
 * Phase 2G — stamp the capture pipeline state on an enrollment.
 * School-scoped. failed/expired carry a reason into revoked_reason
 * WITHOUT revoking the identity (status is untouched — the person is
 * still validly mapped; only the capture attempt failed).
 */
export async function setCaptureStatus(
  schoolId: number,
  enrollmentId: number,
  captureStatus: CaptureStatus,
  opts: { reason?: string; updatedBy?: number | null } = {},
): Promise<boolean> {
  try {
    const res = (await query(
      `UPDATE biometric_enrollments
          SET capture_status = ?,
              captured_at = IF(? IN ('captured','template_received'), COALESCE(captured_at, NOW()), captured_at),
              last_seen_on_device_at = IF(? IN ('captured','template_received'), NOW(), last_seen_on_device_at),
              revoked_reason = COALESCE(?, revoked_reason),
              updated_by = COALESCE(?, updated_by),
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND school_id = ?`,
      [captureStatus, captureStatus, captureStatus,
       opts.reason ? opts.reason.slice(0, 255) : null,
       opts.updatedBy ?? null, enrollmentId, schoolId],
    )) as { affectedRows?: number };
    const ok = (res.affectedRows ?? 0) > 0;
    if (ok) svcLog('CAPTURE_STATUS', { schoolId, enrollmentId, captureStatus, reason: opts.reason ?? null });
    return ok;
  } catch (err) {
    svcLog('CAPTURE_STATUS_FAILED', { schoolId, enrollmentId, captureStatus, error: String(err) });
    return false;
  }
}

/** Phase 2G — stamp capture state by (school, PIN) for callers that
 *  don't hold the enrollment id (the ADMS queue-based enroll routes). */
export async function setCaptureStatusByPin(
  schoolId: number,
  pin: number,
  captureStatus: CaptureStatus,
): Promise<void> {
  if (!schoolId || !pin) return;
  try {
    await query(
      `UPDATE biometric_enrollments
          SET capture_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE school_id = ? AND pin_value = ?
          AND status IN ('active','pending_capture')
          AND capture_status NOT IN ('captured')`,
      [captureStatus, schoolId, pin],
    );
  } catch (err) {
    svcLog('CAPTURE_STATUS_BY_PIN_FAILED', { schoolId, pin, captureStatus, error: String(err) });
  }
}

/**
 * Read the mapping-change history for a device PIN (school-scoped),
 * newest first. Resolves old/new person names for display.
 */
export async function getMappingHistory(
  schoolId: number, deviceSn: string, pin: number, limit = 50,
): Promise<Array<Record<string, unknown>>> {
  try {
    await ensureMappingHistorySchema();
    const lim = Math.min(200, Math.max(1, limit));
    const rows = (await query(
      `SELECT h.id, h.action, h.reason, h.created_at, h.actor_user_id,
              h.old_role_type, h.old_role_ref_id, h.old_person_id,
              h.new_role_type, h.new_role_ref_id, h.new_person_id,
              TRIM(CONCAT_WS(' ', po.first_name, po.last_name)) AS old_person_name,
              TRIM(CONCAT_WS(' ', pn.first_name, pn.last_name)) AS new_person_name,
              TRIM(CONCAT_WS(' ', u.first_name, u.last_name))   AS actor_name
         FROM biometric_mapping_history h
         LEFT JOIN people po ON po.id = h.old_person_id
         LEFT JOIN people pn ON pn.id = h.new_person_id
         LEFT JOIN users  u  ON u.id  = h.actor_user_id
        WHERE h.school_id = ? AND (h.device_sn = ? OR h.device_sn IS NULL) AND h.pin_value = ?
        ORDER BY h.created_at DESC, h.id DESC
        LIMIT ${lim}`,
      [schoolId, deviceSn, pin],
    )) as Array<Record<string, unknown>>;
    return rows;
  } catch (err) {
    svcLog('MAPPING_HISTORY_READ_FAILED', { schoolId, deviceSn, pin, error: String(err) });
    return [];
  }
}
