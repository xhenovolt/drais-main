/**
 * Boarding continuous-presence state (DRAIS Phase 4).
 *
 * One current-state row per student (like students.status) — full history
 * of transitions lives in audit_logs via logAudit(), written by the API
 * routes that call setBoardingPresence(), not duplicated here as a second
 * event table.
 *
 * This is explicitly NOT the same fact as "the student is a boarding
 * student" (students.residency_status) or "the student was physically
 * verified at school today" (a real punch in attendance_raw_events). It is
 * "the school currently assumes this student is residing at school",
 * recorded by an authorized person, and only consulted when the school has
 * opted into continuous-presence mode AND there is no punch for the day.
 */
import { query } from '@/lib/db';

export type BoardingPresenceStatus = 'checked_in' | 'on_leave';

export interface BoardingPresenceState {
  status: BoardingPresenceStatus;
  sinceDate: string;               // YYYY-MM-DD
  expectedReturnDate: string | null;
  reason: string | null;
}

/** Current state, or null if the student has never been checked in. */
export async function getBoardingPresenceState(
  schoolId: number,
  studentId: number,
): Promise<BoardingPresenceState | null> {
  const rows = (await query(
    `SELECT status, since_date, expected_return_date, reason
       FROM boarding_presence
      WHERE school_id = ? AND student_id = ?
      LIMIT 1`,
    [schoolId, studentId],
  )) as Array<{
    status: BoardingPresenceStatus;
    since_date: string | Date;
    expected_return_date: string | Date | null;
    reason: string | null;
  }>;
  const r = rows[0];
  if (!r) return null;
  const toDateStr = (d: string | Date | null) =>
    d == null ? null : (d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));
  return {
    status: r.status,
    sinceDate: toDateStr(r.since_date) as string,
    expectedReturnDate: toDateStr(r.expected_return_date),
    reason: r.reason,
  };
}

/**
 * Whether a checked-in student should be treated as policy-present for
 * `attendanceDate`, given the rule's validity window. on_leave is never
 * "present" here — callers fall through to normal (absent) evaluation and
 * just attach the leave reason as provenance instead.
 */
export function isWithinValidityWindow(
  state: BoardingPresenceState,
  attendanceDate: Date,
  validityDays: number | null | undefined,
): boolean {
  if (state.status !== 'checked_in') return false;
  if (validityDays == null) return true; // indefinite until explicit leave
  const since = new Date(`${state.sinceDate}T00:00:00Z`);
  const target = new Date(Date.UTC(attendanceDate.getFullYear(), attendanceDate.getMonth(), attendanceDate.getDate()));
  const days = Math.floor((target.getTime() - since.getTime()) / 86_400_000);
  return days >= 0 && days <= validityDays;
}

export interface SetBoardingPresenceInput {
  schoolId: number;
  studentId: number;
  personId: number;
  status: BoardingPresenceStatus;
  reason?: string | null;
  expectedReturnDate?: string | null; // only meaningful for on_leave
  recordedBy: number | null;
  source?: 'manual' | 'biometric';
}

/** Upserts the current state. Returns the previous state (or null) so the
 *  caller can write an accurate before/after audit entry. */
export async function setBoardingPresence(
  input: SetBoardingPresenceInput,
): Promise<BoardingPresenceState | null> {
  const previous = await getBoardingPresenceState(input.schoolId, input.studentId);
  await query(
    `INSERT INTO boarding_presence
       (school_id, student_id, person_id, status, since_date, expected_return_date, reason, recorded_by, source)
     VALUES (?, ?, ?, ?, CURDATE(), ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       since_date = CURDATE(),
       expected_return_date = VALUES(expected_return_date),
       reason = VALUES(reason),
       recorded_by = VALUES(recorded_by),
       source = VALUES(source)`,
    [
      input.schoolId, input.studentId, input.personId, input.status,
      input.expectedReturnDate ?? null, input.reason ?? null,
      input.recordedBy, input.source ?? 'manual',
    ],
  );
  return previous;
}
