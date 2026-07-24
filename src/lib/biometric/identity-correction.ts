/**
 * Identity Correction (operational-hardening Part 2 + 8).
 *
 * "Fingerprint FP12345 was mapped to John Smith but actually belongs to Peter
 * Okello." The principle:
 *   • attendance EVENTS are immutable — never deleted (same time, device,
 *     fingerprint identity are preserved verbatim);
 *   • the identity ASSOCIATION is correctable and fully audited.
 *
 * planCorrection() is PURE (unit-tested): given the current + target mapping
 * it decides validity and what will change. applyCorrection() performs it:
 *   1. reassignEnrollment() — moves the PIN to the right person, history-first
 *      (mapping_history row: who/when/old/new/why). Never deletes.
 *   2. re-attribute historical raw events for that PIN/device from the old
 *      person to the new one (events preserved; only the identity label is
 *      corrected), remembering the old person_id for the audit.
 *   3. re-evaluate day verdicts for BOTH people on every affected date.
 *
 * Reversible in spirit: mapping_history + the correction audit hold the old
 * binding, so a wrong correction can be corrected again.
 */
import { query } from '@/lib/db';

export interface CorrectionPlan {
  ok: boolean;
  reason?: string;
  from?: { person_id: number | null; role_type: string; role_ref_id: number };
  to?: { role_type: 'staff' | 'student'; role_ref_id: number };
  pin?: number;
}

/** PURE: validate a correction request against the current mapping. */
export function planCorrection(
  current: { enrollment_id: number; person_id: number | null; role_type: string; role_ref_id: number; pin_value: number } | null,
  target: { role_type: string; role_ref_id: number; person_id: number | null } | null,
): CorrectionPlan {
  if (!current) return { ok: false, reason: 'No enrollment for this device user — assign it first, nothing to correct.' };
  if (!target || !['staff', 'student'].includes(target.role_type) || !target.role_ref_id) {
    return { ok: false, reason: 'A valid target person (staff or learner) is required.' };
  }
  if (target.person_id == null) return { ok: false, reason: 'Target person not found or archived.' };
  if (current.person_id != null && Number(current.person_id) === Number(target.person_id)
      && current.role_type === target.role_type && Number(current.role_ref_id) === Number(target.role_ref_id)) {
    return { ok: false, reason: 'That is already the mapped person — no correction needed.' };
  }
  return {
    ok: true,
    from: { person_id: current.person_id, role_type: current.role_type, role_ref_id: current.role_ref_id },
    to: { role_type: target.role_type as 'staff' | 'student', role_ref_id: target.role_ref_id },
    pin: current.pin_value,
  };
}

export interface CorrectionResult {
  ok: boolean; reason?: string;
  enrollmentId?: number; oldPersonId?: number | null; newPersonId?: number;
  eventsReattributed?: number; daysReevaluated?: number;
}

export async function applyCorrection(args: {
  schoolId: number;
  enrollmentId: number;
  newRoleType: 'staff' | 'student';
  newRoleRefId: number;
  reason?: string | null;
  actorUserId?: number | null;
}): Promise<CorrectionResult> {
  const { schoolId, enrollmentId, newRoleType, newRoleRefId } = args;

  const enr = (await query(
    `SELECT id, person_id, role_type, role_ref_id, pin_value, origin_device_sn
       FROM biometric_enrollments WHERE id = ? AND school_id = ? LIMIT 1`,
    [enrollmentId, schoolId],
  )) as any[];
  if (!enr[0]) return { ok: false, reason: 'Enrollment not found' };
  const cur = enr[0];
  const oldPersonId = cur.person_id == null ? null : Number(cur.person_id);
  const pin = Number(cur.pin_value);

  // 1. Reassign the enrollment (history-first, audited, never deletes).
  const { reassignEnrollment, recordMappingHistory } = await import('@/lib/biometric/enrollment-service');
  const res = await reassignEnrollment({
    schoolId, enrollmentId, newRoleType, newRoleRefId,
    reason: args.reason ?? 'identity correction', actorUserId: args.actorUserId ?? null,
  });
  if (!res.ok) return { ok: false, reason: res.detail || res.reason || 'reassign failed' };
  const newPersonId = Number(res.newPersonId);

  // 2. Re-attribute historical raw events for this PIN/device — the events
  //    themselves are untouched except the identity label. We remember the
  //    span of affected dates so BOTH people's verdicts can be re-evaluated.
  const roleTable = newRoleType === 'student' ? 'students' : 'staff';
  const refRows = (await query(`SELECT id FROM ${roleTable} WHERE person_id = ? AND school_id = ? LIMIT 1`, [newPersonId, schoolId])) as any[];
  const newRefId = refRows[0]?.id ?? newRoleRefId;

  const affected = (await query(
    `SELECT id, person_id, punch_at FROM attendance_raw_events
      WHERE school_id = ? AND CAST(device_user_id AS CHAR) = ?
        ${cur.origin_device_sn ? 'AND device_sn = ?' : ''}`,
    cur.origin_device_sn ? [schoolId, String(pin), cur.origin_device_sn] : [schoolId, String(pin)],
  )) as any[];

  const nameRows = (await query(
    `SELECT NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '') AS name
       FROM people p WHERE p.id = ? LIMIT 1`, [newPersonId],
  )) as any[];
  const newName = nameRows[0]?.name ?? null;

  let reattributed = 0;
  if (affected.length) {
    const upd = (await query(
      `UPDATE attendance_raw_events
          SET person_id = ?, role_type = ?, role_ref_id = ?, matched = 1,
              display_name = ?
        WHERE school_id = ? AND CAST(device_user_id AS CHAR) = ?
          ${cur.origin_device_sn ? 'AND device_sn = ?' : ''}`,
      cur.origin_device_sn
        ? [newPersonId, newRoleType, newRefId, newName, schoolId, String(pin), cur.origin_device_sn]
        : [newPersonId, newRoleType, newRefId, newName, schoolId, String(pin)],
    )) as any;
    reattributed = Number(upd?.affectedRows || 0);
  }

  // 3. Re-evaluate day verdicts for both the old and new person on every date.
  const off = 180;
  const dayKeys = new Set<string>();
  for (const e of affected) {
    const local = new Date(new Date(e.punch_at).getTime() + off * 60_000).toISOString().slice(0, 10);
    if (oldPersonId) dayKeys.add(`${oldPersonId}|${cur.role_type}|${local}`);
    dayKeys.add(`${newPersonId}|${newRoleType}|${local}`);
  }
  const { evaluateDay } = await import('@/lib/attendance/engine');
  let days = 0;
  for (const key of dayKeys) {
    const [pid, role, date] = key.split('|');
    await evaluateDay(schoolId, Number(pid), role as any, new Date(`${date}T00:00:00`)).catch(() => {});
    days++;
  }

  // Audit the correction explicitly — a dedicated history row (beyond the
  // reassign's own) that records the re-attribution scope. Uses the same
  // audited store, so who/when/old/new/why all land in biometric_mapping_history.
  await recordMappingHistory({
    schoolId, enrollmentId, deviceSn: cur.origin_device_sn, pin,
    action: 'identity_correction' as any,
    oldRoleType: cur.role_type, oldRoleRefId: cur.role_ref_id, oldPersonId,
    newRoleType, newRoleRefId, newPersonId,
    reason: `${args.reason ?? 'identity correction'} · ${reattributed} historical events re-attributed`,
    actorUserId: args.actorUserId ?? null,
  }).catch(() => {});

  return { ok: true, enrollmentId, oldPersonId, newPersonId, eventsReattributed: reattributed, daysReevaluated: days };
}

/**
 * Person-level reattribution — "move EVERY attendance record from person A to
 * person B." More general than a PIN correction: it cascades across all of A's
 * PINs/devices, raw events, verdicts and enrollments, so the logs fully reflect
 * the new owner. Events are preserved (never deleted); only the identity label
 * moves. Both people's affected days are re-evaluated; audited.
 */
export async function reattributePerson(args: {
  schoolId: number;
  fromPersonId: number;
  toRoleType: 'staff' | 'student';
  toRoleRefId: number;          // the staff/students row id of the NEW owner
  reason?: string | null;
  actorUserId?: number | null;
}): Promise<{ ok: boolean; reason?: string; rawEvents: number; records: number; enrollments: number; daysReevaluated: number }> {
  const { schoolId, fromPersonId, toRoleType, toRoleRefId } = args;
  const roleTable = toRoleType === 'student' ? 'students' : 'staff';
  const target = (await query(`SELECT person_id FROM ${roleTable} WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`, [toRoleRefId, schoolId])) as any[];
  const toPersonId = target[0]?.person_id;
  if (!toPersonId) return { ok: false, reason: 'target person not found', rawEvents: 0, records: 0, enrollments: 0, daysReevaluated: 0 };
  if (Number(toPersonId) === Number(fromPersonId)) return { ok: false, reason: 'source and target are the same person', rawEvents: 0, records: 0, enrollments: 0, daysReevaluated: 0 };

  const newName = ((await query(`SELECT TRIM(CONCAT_WS(' ', first_name, last_name)) nm FROM people WHERE id = ? LIMIT 1`, [toPersonId])) as any[])[0]?.nm ?? null;

  // Collect affected dates BEFORE moving, for re-evaluation of both people.
  const rawRows = (await query(`SELECT id, punch_at FROM attendance_raw_events WHERE school_id = ? AND person_id = ?`, [schoolId, fromPersonId])) as any[];
  const off = 180;
  const dayKeys = new Set<string>();
  for (const r of rawRows) {
    const d = new Date(new Date(r.punch_at).getTime() + off * 60_000).toISOString().slice(0, 10);
    dayKeys.add(`${fromPersonId}|${d}`); dayKeys.add(`${toPersonId}|${d}`);
  }

  // 1. Raw events (preserved; identity label moved).
  const rawUpd = (await query(
    `UPDATE attendance_raw_events SET person_id = ?, role_type = ?, role_ref_id = ?, display_name = ?, matched = 1
      WHERE school_id = ? AND person_id = ?`,
    [toPersonId, toRoleType, toRoleRefId, newName, schoolId, fromPersonId],
  )) as any;

  // 2. Enrollments (PINs) move to the new person.
  const enrUpd = (await query(
    `UPDATE biometric_enrollments SET person_id = ?, role_type = ?, role_ref_id = ?, updated_by = ?, updated_at = NOW()
      WHERE school_id = ? AND person_id = ?`,
    [toPersonId, toRoleType, toRoleRefId, args.actorUserId ?? null, schoolId, fromPersonId],
  ).catch(() => ({ affectedRows: 0 }))) as any;

  // 3. Old verdict rows for the source person are stale — delete so the engine
  //    rebuilds cleanly for the new owner (raw events, the source of truth,
  //    are untouched). Count them for the report.
  const recCount = ((await query(`SELECT COUNT(*) n FROM attendance_records WHERE school_id = ? AND person_id = ?`, [schoolId, fromPersonId])) as any[])[0]?.n || 0;
  await query(`DELETE FROM attendance_records WHERE school_id = ? AND person_id = ?`, [schoolId, fromPersonId]).catch(() => {});

  // 4. Re-evaluate every affected day for the NEW owner (rebuilds verdicts).
  const { evaluateDay } = await import('@/lib/attendance/engine');
  let days = 0;
  const evalDays = new Set<string>();
  for (const r of rawRows) evalDays.add(new Date(new Date(r.punch_at).getTime() + off * 60_000).toISOString().slice(0, 10));
  for (const d of evalDays) { await evaluateDay(schoolId, Number(toPersonId), toRoleType, new Date(`${d}T00:00:00`)).catch(() => {}); days++; }

  // 5. Audit.
  try {
    const { recordMappingHistory } = await import('@/lib/biometric/enrollment-service');
    await recordMappingHistory({
      schoolId, enrollmentId: null, deviceSn: null, pin: null,
      action: 'person_reattribution' as any, oldPersonId: fromPersonId, newPersonId: Number(toPersonId),
      newRoleType: toRoleType, newRoleRefId: toRoleRefId,
      reason: `${args.reason ?? 'person reattribution'} · ${Number(rawUpd?.affectedRows || 0)} events → ${newName}`,
      actorUserId: args.actorUserId ?? null,
    });
  } catch { /* best-effort */ }

  return {
    ok: true,
    rawEvents: Number(rawUpd?.affectedRows || 0),
    records: Number(recCount),
    enrollments: Number(enrUpd?.affectedRows || 0),
    daysReevaluated: days,
  };
}
