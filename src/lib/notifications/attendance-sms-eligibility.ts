/**
 * Business rule for biometric attendance SMS (arrival / late / absent).
 *
 * An attendance SMS is a claim about what a biometric device observed. It is
 * only allowed when the system can actually stand behind that claim:
 *
 *   1. The verdict is not policy-derived (no punch evidence by design).
 *   2. The attendance date is fresh (today or the previous school day). The
 *      self-healing sweep re-finalises up to 7 days back; those historical
 *      catch-up verdicts must never reach a parent as if they were live.
 *   3. Punch-backed statuses (present/late/half_day/early_leave) need a real
 *      first-in punch on the verdict.
 *   4. Every other status (absent, holiday, weekend) needs the subject to be
 *      biometrically onboarded: an ACTIVE enrolment plus proof the template
 *      reached a device (capture evidence) or the person has punched before.
 *      A learner who was never put on the biometric system cannot punch, so
 *      "absent" says nothing about them.
 *
 * General school SMS (fees, announcements, broadcasts) does not flow through
 * this file and is unaffected.
 */
import { query } from '@/lib/db';

export const MAX_ATTENDANCE_SMS_AGE_DAYS = 1;

const PUNCH_BACKED = new Set(['present', 'late', 'half_day', 'early_leave']);

export const isPunchBackedStatus = (status: string): boolean => PUNCH_BACKED.has(status);

export interface BiometricEvidence {
  hasActiveEnrollment: boolean;
  hasCaptureEvidence: boolean;
  hasEverPunched: boolean;
}

export interface EligibilityInput {
  status: string;
  attendanceDate: string; // YYYY-MM-DD, school-local
  todayLocal: string;     // YYYY-MM-DD, school-local
  firstInAt: string | null;
  isPolicyDerived?: boolean;
  evidence: BiometricEvidence;
}

export type EligibilityVerdict =
  | { eligible: true }
  | { eligible: false; reason: string };

export const NO_EVIDENCE: BiometricEvidence = {
  hasActiveEnrollment: false, hasCaptureEvidence: false, hasEverPunched: false,
};

/** School-local calendar date (YYYY-MM-DD) for an instant. */
export function schoolLocalDate(now: Date = new Date(), offsetMinutes?: number): string {
  const off = offsetMinutes ?? Number(process.env.SCHOOL_UTC_OFFSET_MINUTES ?? 180);
  const l = new Date(now.getTime() + off * 60_000);
  return l.toISOString().slice(0, 10);
}

function dayDiff(later: string, earlier: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000);
}

/** PURE: may an attendance SMS be sent for this verdict? */
export function evaluateAttendanceSmsEligibility(input: EligibilityInput): EligibilityVerdict {
  if (input.isPolicyDerived) return { eligible: false, reason: 'policy_derived_verdict' };

  const age = dayDiff(input.todayLocal, input.attendanceDate);
  if (Number.isNaN(age)) return { eligible: false, reason: 'invalid_date' };
  if (age < 0) return { eligible: false, reason: 'future_date' };
  if (age > MAX_ATTENDANCE_SMS_AGE_DAYS) return { eligible: false, reason: 'stale_attendance_date' };

  if (PUNCH_BACKED.has(input.status)) {
    return input.firstInAt
      ? { eligible: true }
      : { eligible: false, reason: 'no_punch_evidence' };
  }

  const ev = input.evidence;
  if (!ev.hasActiveEnrollment) return { eligible: false, reason: 'not_biometrically_enrolled' };
  if (!ev.hasCaptureEvidence && !ev.hasEverPunched) return { eligible: false, reason: 'no_device_evidence' };
  return { eligible: true };
}

/** DB read. Fails closed (no evidence) if the enrolment table is unavailable. */
export async function loadBiometricEvidence(schoolId: number, personId: number): Promise<BiometricEvidence> {
  try {
    const rows = (await query(
      `SELECT
         EXISTS(SELECT 1 FROM biometric_enrollments b
                 WHERE b.school_id = ? AND b.person_id = ? AND b.status = 'active') AS active_enr,
         EXISTS(SELECT 1 FROM biometric_enrollments b
                 WHERE b.school_id = ? AND b.person_id = ? AND b.status = 'active'
                   AND (b.captured_at IS NOT NULL OR b.last_seen_on_device_at IS NOT NULL)) AS captured,
         EXISTS(SELECT 1 FROM attendance_raw_events e
                 WHERE e.school_id = ? AND e.person_id = ?) AS punched`,
      [schoolId, personId, schoolId, personId, schoolId, personId],
    )) as Array<{ active_enr: number | string; captured: number | string; punched: number | string }>;
    const r = rows[0];
    return {
      hasActiveEnrollment: Number(r?.active_enr ?? 0) > 0,
      hasCaptureEvidence: Number(r?.captured ?? 0) > 0,
      hasEverPunched: Number(r?.punched ?? 0) > 0,
    };
  } catch {
    return NO_EVIDENCE;
  }
}

/**
 * Re-check a QUEUED message at send time. The world may have changed since it
 * was enqueued: the learner's enrolment revoked, the verdict overwritten by a
 * later evaluation, or the message simply sat in the queue past its date.
 * Non-attendance messages (no attendance dedup_key) are always allowed.
 */
export async function revalidateQueuedAttendanceMessage(
  schoolId: number,
  dedupKey: string | null,
  now: Date = new Date(),
): Promise<EligibilityVerdict> {
  const att = parseAttendanceDedupKey(dedupKey);
  if (!att) return { eligible: true };

  let rec: { status: string; first_in_at: string | Date | null; is_policy_derived: number | null } | undefined;
  try {
    const rows = (await query(
      `SELECT status, first_in_at, is_policy_derived
         FROM attendance_records
        WHERE school_id = ? AND person_id = ? AND attendance_date = ?
        LIMIT 1`,
      [schoolId, att.personId, att.attendanceDate],
    )) as Array<NonNullable<typeof rec>>;
    rec = rows[0];
  } catch {
    return { eligible: false, reason: 'record_lookup_failed' };
  }
  if (!rec) return { eligible: false, reason: 'record_missing' };
  if (rec.status !== att.status) return { eligible: false, reason: 'verdict_superseded' };

  return evaluateAttendanceSmsEligibility({
    status: rec.status,
    attendanceDate: att.attendanceDate,
    todayLocal: schoolLocalDate(now),
    firstInAt: rec.first_in_at ? String(rec.first_in_at) : null,
    isPolicyDerived: Number(rec.is_policy_derived ?? 0) === 1,
    evidence: isPunchBackedStatus(rec.status) ? NO_EVIDENCE : await loadBiometricEvidence(schoolId, att.personId),
  });
}

/** Parse the attendance date + status a queued attendance message was created for. */
export function parseAttendanceDedupKey(key: string | null | undefined):
  { policyId: number; personId: number; attendanceDate: string; status: string } | null {
  if (!key) return null;
  // Optional ":r<last-6-phone-digits>" suffix = the 2nd+ guardian of the same logical event.
  const m = /^(\d+):(\d+):attendance\.record\.upserted:(\d{4}-\d{2}-\d{2}):([a-z_]+)(?::r\d{0,6})?$/.exec(key);
  if (!m) return null;
  return { policyId: Number(m[1]), personId: Number(m[2]), attendanceDate: m[3], status: m[4] };
}
