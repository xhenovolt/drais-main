/**
 * POST /api/attendance/devices/[sn]/users/[pin]
 *
 * Phase 3D — single entry point for resolving one device user. The
 * action discriminator keeps the per-user workflow DRY (the spec
 * permits consolidation):
 *
 *   { action: 'map', user_type, student_id|staff_id }
 *   { action: 'create-student', first_name, last_name, class_id, stream_id?, admission_no?, gender? }
 *   { action: 'create-staff', first_name, last_name, designation?, department?, phone?, gender? }
 *   { action: 'ignore' }
 *   { action: 'quarantine' }
 *   { action: 'release' }   // un-ignore / un-quarantine
 *
 * All identity writes go through the enrollment service so the Phase 1E
 * safety rules (PIN-conflict refusal, school scope, canonical write +
 * legacy mirror, deterministic-only auto-map) are enforced once.
 * Prior unmatched punches for the PIN are re-matched and re-classified.
 * Every action is audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveDeviceForSession } from '@/lib/biometric/device-access';
import {
  upsertEnrollment, reassignEnrollment, unmapEnrollment, getMappingHistory,
} from '@/lib/biometric/enrollment-service';
import { auditDirectoryAction } from '@/lib/biometric/reconciliation-service';
import { markPendingResolved } from '@/lib/biometric/pending-device-users';
import { backfillAttendanceRawEventsForMapping } from '@/lib/attendance/raw-event-backfill';
import { evaluateDay } from '@/lib/attendance/engine';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/devices/[sn]/users/[pin]/history — mapping change
 * history for one PIN (who mapped/reassigned/unmapped, old→new person).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; pin: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id, pin } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  const sn = access.device?.sn ?? id;
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const pinNum = Number(pin);
  if (!Number.isFinite(pinNum)) return NextResponse.json({ error: 'invalid pin' }, { status: 422 });
  const history = await getMappingHistory(access.schoolId, sn, pinNum);
  return NextResponse.json({ success: true, pin, history });
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; pin: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id, pin } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  const sn = access.device?.sn ?? id;
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const schoolId = access.schoolId;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const action = body?.action;

  const pinNum = Number(pin);
  const validPin = Number.isFinite(pinNum) && pinNum > 0 && pinNum <= 65535;

  try {
    // ── ignore / quarantine / release ─────────────────────────────────
    if (action === 'ignore' || action === 'quarantine' || action === 'release') {
      const status = action === 'ignore' ? 'ignored' : action === 'quarantine' ? 'quarantined' : 'pending';
      // Reflect on pending_device_users (creates the row if absent so the
      // decision persists even for a directory-only user).
      await query(
        `INSERT INTO pending_device_users (school_id, device_sn, device_user_pin, status, reason)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), reason = VALUES(reason), last_seen = NOW()`,
        [schoolId, sn, String(pin), status === 'pending' ? 'pending' : status,
         action === 'release' ? 'released by operator' : `${action}d by operator`],
      );
      // Update open reconciliation items for this pin.
      await query(
        `UPDATE device_reconciliation_items
            SET action_status = ?, action_taken = ?, resolved_by = ?, resolved_at = NOW()
          WHERE device_sn = ? AND device_user_pin = ? AND action_status IN ('open','ignored','quarantined')`,
        [action === 'release' ? 'open' : status, action, session.userId, sn, String(pin)],
      );
      await auditDirectoryAction(schoolId, sn, String(pin), action, session.userId, {});
      return NextResponse.json({ success: true, action, pin });
    }

    if (!validPin) {
      return NextResponse.json({ error: `device PIN '${pin}' is not a valid numeric PIN` }, { status: 422 });
    }

    // Look up the active canonical enrollment for this PIN (server-side —
    // never trust a client-supplied enrollment id).
    async function activeEnrollmentForPin(): Promise<{ id: number } | null> {
      const rows = (await query(
        `SELECT id FROM biometric_enrollments
          WHERE school_id = ? AND pin_value = ?
            AND status IN ('active','pending_capture','suspended')
          ORDER BY FIELD(status,'active','pending_capture','suspended') LIMIT 1`,
        [schoolId, pinNum],
      )) as Array<{ id: number }>;
      return rows[0] ?? null;
    }

    // ── reassign: move this PIN to a different learner/staff ──────────
    if (action === 'reassign') {
      const newRoleType: 'student' | 'staff' = body.user_type;
      const newRoleRefId = newRoleType === 'student' ? Number(body.student_id) : Number(body.staff_id);
      if (!['student', 'staff'].includes(newRoleType) || !newRoleRefId) {
        return NextResponse.json({ error: 'user_type and student_id/staff_id required for reassign' }, { status: 400 });
      }
      const enr = await activeEnrollmentForPin();
      if (!enr) return NextResponse.json({ error: `PIN ${pin} has no enrollment to reassign. Map it first.` }, { status: 404 });
      const res = await reassignEnrollment({
        schoolId, enrollmentId: enr.id, newRoleType, newRoleRefId,
        reason: body.reason ?? null, actorUserId: session.userId,
      });
      if (!res.ok) {
        const status = res.reason === 'person_not_found' ? 404 : res.reason === 'same_person' ? 409 : 400;
        return NextResponse.json({ error: `Reassignment failed: ${res.detail || res.reason}` }, { status });
      }
      // Re-match ONLY still-unmatched punches for this PIN to the new
      // person. Already-matched historical punches stay with the old
      // person (denormalised at punch time).
      let rematched = 0;
      try {
        const r = await query(
          `UPDATE zk_attendance_logs SET student_id = ?, staff_id = ?, matched = 1
            WHERE school_id = ? AND device_user_id = ? AND matched = 0`,
          [newRoleType === 'student' ? newRoleRefId : null, newRoleType === 'staff' ? newRoleRefId : null, schoolId, String(pin)],
        );
        rematched = (r as any)?.affectedRows || 0;
      } catch { /* non-fatal */ }
      try {
        const backfill = await backfillAttendanceRawEventsForMapping({
          schoolId, deviceUserId: String(pin), deviceSn: sn,
          studentId: newRoleType === 'student' ? newRoleRefId : null,
          staffId: newRoleType === 'staff' ? newRoleRefId : null,
        });
        if (res.newPersonId && backfill.affectedDates.length > 0) {
          for (const d of backfill.affectedDates) await evaluateDay(schoolId, Number(res.newPersonId), newRoleType, d);
        }
      } catch (e) { console.warn('[reassign] backfill failed:', e); }
      await auditDirectoryAction(schoolId, sn, String(pin), 'reassign', session.userId,
        { enrollment_id: enr.id, to_role: newRoleType, to_ref: newRoleRefId, reason: body.reason ?? null });
      return NextResponse.json({
        success: true, action, pin, enrollment_id: enr.id,
        role_type: newRoleType, role_ref_id: newRoleRefId, rematched,
        message: `PIN ${pin} reassigned to ${newRoleType} #${newRoleRefId}. Future scans use the new person; past attendance stays with the previous person.`,
      });
    }

    // ── unmap: release the PIN (revoke enrollment) ────────────────────
    if (action === 'unmap') {
      const enr = await activeEnrollmentForPin();
      if (!enr) return NextResponse.json({ error: `PIN ${pin} is not mapped.` }, { status: 404 });
      const res = await unmapEnrollment({
        schoolId, enrollmentId: enr.id, reason: body.reason ?? 'unmapped by operator', actorUserId: session.userId,
      });
      if (!res.ok) return NextResponse.json({ error: `Unmap failed: ${res.detail || 'unknown error'}` }, { status: 400 });
      await query(
        `UPDATE device_reconciliation_items
            SET action_status = 'resolved', action_taken = 'unmap', resolved_by = ?, resolved_at = NOW()
          WHERE device_sn = ? AND device_user_pin = ? AND action_status = 'open'`,
        [session.userId, sn, String(pin)],
      ).catch(() => {});
      await auditDirectoryAction(schoolId, sn, String(pin), 'unmap', session.userId, { enrollment_id: enr.id, reason: body.reason ?? null });
      return NextResponse.json({ success: true, action, pin, message: `PIN ${pin} unmapped. It is now available for mapping.` });
    }

    let roleType: 'student' | 'staff';
    let roleRefId: number;

    // ── create-student ────────────────────────────────────────────────
    if (action === 'create-student') {
      const { first_name, last_name, class_id, stream_id, admission_no, gender } = body;
      if (!first_name || !last_name) return NextResponse.json({ error: 'first_name and last_name required' }, { status: 400 });
      if (!class_id) return NextResponse.json({ error: 'class_id is required to create a learner' }, { status: 400 });
      const personRes = (await query(
        `INSERT INTO people (school_id, first_name, last_name, gender, created_at)
         VALUES (?, ?, ?, ?, NOW())`,
        [schoolId, String(first_name).trim(), String(last_name).trim(), gender ?? null],
      )) as any;
      const studentRes = (await query(
        `INSERT INTO students (school_id, person_id, status, admission_no, admission_date, created_at)
         VALUES (?, ?, 'active', ?, CURDATE(), NOW())`,
        [schoolId, personRes.insertId, admission_no ?? null],
      )) as any;
      roleType = 'student'; roleRefId = studentRes.insertId;
      // Enrollment (class/stream)
      await query(
        `INSERT INTO enrollments (school_id, student_id, class_id, stream_id, status, enrollment_date, created_at)
         VALUES (?, ?, ?, ?, 'active', CURDATE(), NOW())`,
        [schoolId, roleRefId, class_id, stream_id ?? null],
      ).catch((e: any) => console.warn('[create-student] enrollment insert non-fatal:', e.message));
      await auditDirectoryAction(schoolId, sn, String(pin), 'create-student', session.userId,
        { person_id: personRes.insertId, student_id: roleRefId, class_id, stream_id: stream_id ?? null });
    }
    // ── create-staff ──────────────────────────────────────────────────
    else if (action === 'create-staff') {
      const { first_name, last_name, designation, department, phone, gender } = body;
      if (!first_name || !last_name) return NextResponse.json({ error: 'first_name and last_name required' }, { status: 400 });
      const personRes = (await query(
        `INSERT INTO people (school_id, first_name, last_name, gender, phone, created_at)
         VALUES (?, ?, ?, ?, ?, NOW())`,
        [schoolId, String(first_name).trim(), String(last_name).trim(), gender ?? null, phone ?? null],
      )) as any;
      const staffRes = (await query(
        `INSERT INTO staff (school_id, person_id, status, created_at)
         VALUES (?, ?, 'active', NOW())`,
        [schoolId, personRes.insertId],
      )) as any;
      roleType = 'staff'; roleRefId = staffRes.insertId;
      await auditDirectoryAction(schoolId, sn, String(pin), 'create-staff', session.userId,
        { person_id: personRes.insertId, staff_id: roleRefId, designation: designation ?? null, department: department ?? null });
    }
    // ── map to existing ───────────────────────────────────────────────
    else if (action === 'map') {
      roleType = body.user_type;
      roleRefId = roleType === 'student' ? Number(body.student_id) : Number(body.staff_id);
      if (!['student', 'staff'].includes(roleType) || !roleRefId) {
        return NextResponse.json({ error: 'user_type and student_id/staff_id required for map' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: `unknown action '${action}'` }, { status: 400 });
    }

    // ── Canonical write via the enrollment service (safety enforced) ──
    const enrollment = await upsertEnrollment({
      schoolId, roleType, roleRefId, pin: pinNum, deviceSn: sn,
      source: `device_reconcile:${action}`, enrolledBy: session.userId,
    });
    if (!enrollment.ok) {
      return NextResponse.json({
        error: enrollment.reason === 'pin_conflict'
          ? `PIN ${pinNum} is actively mapped to another person. Resolve the conflict first.`
          : `Mapping rejected: ${enrollment.reason}${enrollment.detail ? ` (${enrollment.detail})` : ''}`,
      }, { status: 409 });
    }

    // ── Re-match prior unmatched punches + re-classify ────────────────
    let rematched = 0;
    try {
      const r = await query(
        `UPDATE zk_attendance_logs SET student_id = ?, staff_id = ?, matched = 1
          WHERE school_id = ? AND device_user_id = ? AND matched = 0`,
        [roleType === 'student' ? roleRefId : null, roleType === 'staff' ? roleRefId : null, schoolId, String(pin)],
      );
      rematched = (r as any)?.affectedRows || 0;
    } catch { /* non-fatal */ }
    try {
      const backfill = await backfillAttendanceRawEventsForMapping({
        schoolId, deviceUserId: String(pin), deviceSn: sn,
        studentId: roleType === 'student' ? roleRefId : null,
        staffId: roleType === 'staff' ? roleRefId : null,
      });
      if (enrollment.personId && backfill.affectedDates.length > 0) {
        for (const d of backfill.affectedDates) await evaluateDay(schoolId, Number(enrollment.personId), roleType, d);
      }
    } catch (e) { console.warn('[device user map] backfill failed:', e); }

    // Resolve open reconciliation items + pending row for this pin.
    await query(
      `UPDATE device_reconciliation_items
          SET action_status = 'resolved', action_taken = ?, matched_person_id = ?,
              matched_role_type = ?, matched_role_ref_id = ?, canonical_enrollment_id = ?,
              resolved_by = ?, resolved_at = NOW()
        WHERE device_sn = ? AND device_user_pin = ? AND action_status = 'open'`,
      [action, enrollment.personId ?? null, roleType, roleRefId, enrollment.enrollmentId ?? null,
       session.userId, sn, String(pin)],
    );
    await markPendingResolved(schoolId, sn, String(pin), 'mapped', session.userId, enrollment.enrollmentId ?? null);

    return NextResponse.json({
      success: true, action, pin,
      enrollment_id: enrollment.enrollmentId,
      role_type: roleType, role_ref_id: roleRefId,
      rematched,
      message: `${action === 'map' ? 'Mapped' : 'Created and mapped'} device PIN ${pin} to ${roleType} #${roleRefId}${rematched > 0 ? `. ${rematched} prior punches re-matched.` : ''}`,
    });
  } catch (err: any) {
    console.error('[device user action]', err);
    return NextResponse.json({ error: err.message || 'Action failed' }, { status: 500 });
  }
}
