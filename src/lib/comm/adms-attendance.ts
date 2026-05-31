/**
 * ADMS attendance → comm dispatcher bridge.
 *
 * When the ZKTeco ADMS push handler (src/app/api/zk-handler/route.ts)
 * saves a matched attendance punch, it calls notifyAdmsAttendance() in
 * fire-and-forget mode. We:
 *
 *   1. Look up the matched person's name + class (1 query).
 *   2. Decide checkin vs checkout from the device's INOUTMODE field
 *      (0 = check-in is the ZKTeco convention; other modes default
 *      to checkin so a school using a single mode device still sees
 *      arrival messages).
 *   3. Fire the existing comm dispatcher (`emit('learner.attendance.
 *      checkin', ...)` or staff variant).
 *
 * Routing — who actually receives the SMS — is governed by the
 * school's `comm_rules` table, edited from the existing
 * /admin/communications UI:
 *
 *     learner.attendance.checkin    → audience='parents'      → SMS to learner's parents/guardians
 *     learner.attendance.checkout   → audience='parents'      → SMS to learner's parents/guardians
 *     staff.attendance.checkin      → audience='headteacher'  → SMS to school's headteacher
 *     staff.attendance.checkout     → audience='headteacher'  → SMS to school's headteacher
 *
 * Schools that don't want these messages just leave the rule
 * inactive (the dispatcher writes a 'skipped' audit row but sends
 * nothing).
 *
 * Non-negotiables for this module:
 *   - NEVER throw. The ADMS handler must always respond 'OK' to the
 *     device — a thrown error here would propagate and break the
 *     push protocol.
 *   - NEVER block. Caller invokes us without await + .catch(()=>{})
 *     so device round-trip latency is unaffected.
 *   - No I/O cost when there's nothing to send. We do exactly one
 *     name-lookup query per matched punch; the dispatcher short-
 *     circuits when no comm_rule is active.
 */

import { query } from '@/lib/db';
import { emit } from './dispatcher';
import type { CommEventType } from './events';

export interface NotifyAdmsAttendanceArgs {
  schoolId:    number;
  /** Exactly ONE of studentId / staffId is non-null. Both null → noop. */
  studentId:   number | null;
  staffId:     number | null;
  /** ISO datetime — already normalised by the ADMS handler. */
  checkTime:   string;
  /** Raw ZKTeco IN/OUT mode. 0 = check-in, 1 = check-out is the standard
   *  convention; other codes are vendor/firmware specific and default to
   *  check-in. NULL when the device didn't supply one. */
  inOutMode:   number | null;
  /** Device serial for the audit log. Optional. */
  deviceSn?:   string;
}

/**
 * Fire-and-forget bridge from the ADMS save path to the comm dispatcher.
 * Returns a resolved Promise even on failure — the ADMS contract is
 * "always respond OK".
 */
export async function notifyAdmsAttendance(args: NotifyAdmsAttendanceArgs): Promise<void> {
  try {
    // No matched person → nothing to notify. Orphan punches are handled
    // separately (zk_attendance_logs.matched=0).
    if (args.studentId == null && args.staffId == null) return;

    // Decide direction.
    const eventType = pickEventType(args);
    if (!eventType) return;

    // Resolve name (+ class for students) for the SMS template.
    const subject = args.studentId != null
      ? await loadStudentSubject(args.studentId, args.schoolId)
      : await loadStaffSubject(args.staffId!, args.schoolId);

    if (!subject) return; // Person was matched but row vanished — log and bail silently.

    // Fire the dispatcher. emit() itself catches per-recipient errors
    // and writes audit rows, so we don't need to drill deeper here.
    await dispatchByEventType(eventType, args, subject);
  } catch (err) {
    // Last-line-of-defense — never let comm failures break the ADMS
    // push protocol. Log and swallow.
    // eslint-disable-next-line no-console
    console.warn('[adms-attendance] emit failed:', err);
  }
}

// ─── Direction decoding ──────────────────────────────────────────────────────
function pickEventType(args: NotifyAdmsAttendanceArgs): CommEventType | null {
  const isStudent = args.studentId != null;
  // ZKTeco INOUTMODE convention:
  //   0 = check-in / verification (treated as arrival)
  //   1 = check-out / leaving
  //   2,3,4,5 = break-out/break-in (firmware-dependent; we treat as out/in conservatively)
  //   undefined / null = no direction reported → default to check-in
  //     (most schools use the device for arrival only, which sends no mode).
  const dir: 'in' | 'out' =
    args.inOutMode === 1 || args.inOutMode === 2 || args.inOutMode === 4 ? 'out' : 'in';
  if (isStudent) {
    return dir === 'in' ? 'learner.attendance.checkin' : 'learner.attendance.checkout';
  }
  return dir === 'in' ? 'staff.attendance.checkin' : 'staff.attendance.checkout';
}

// ─── Subject loaders ─────────────────────────────────────────────────────────
interface StudentSubject {
  studentId:    number;
  studentName:  string;
  classLabel:   string | null;
}
interface StaffSubject {
  staffId:      number;
  staffName:    string;
}

async function loadStudentSubject(
  studentId: number,
  schoolId: number,
): Promise<StudentSubject | null> {
  const rows = (await query(
    `SELECT s.id AS student_id,
            CONCAT(COALESCE(s.first_name, ''), ' ', COALESCE(s.last_name, '')) AS full_name,
            c.name AS class_name
       FROM students s
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       LEFT JOIN classes c     ON c.id = e.class_id
      WHERE s.id = ? AND s.school_id = ?
      LIMIT 1`,
    [studentId, schoolId],
  )) as Array<{ student_id: number; full_name: string; class_name: string | null }>;
  const row = rows?.[0];
  if (!row) return null;
  const name = row.full_name?.trim();
  if (!name) return null;
  return {
    studentId: row.student_id,
    studentName: name,
    classLabel: row.class_name ?? null,
  };
}

async function loadStaffSubject(
  staffId: number,
  schoolId: number,
): Promise<StaffSubject | null> {
  // Staff names live across `staff` + `people`; we union both shapes.
  const rows = (await query(
    `SELECT s.id AS staff_id,
            COALESCE(
              CONCAT(COALESCE(s.first_name,''), ' ', COALESCE(s.last_name,'')),
              CONCAT(COALESCE(p.first_name,''), ' ', COALESCE(p.last_name,''))
            ) AS full_name
       FROM staff s
       LEFT JOIN people p ON p.id = s.person_id
      WHERE s.id = ? AND s.school_id = ?
      LIMIT 1`,
    [staffId, schoolId],
  )) as Array<{ staff_id: number; full_name: string | null }>;
  const row = rows?.[0];
  if (!row) return null;
  const name = row.full_name?.trim();
  if (!name) return null;
  return { staffId: row.staff_id, staffName: name };
}

// ─── Payload dispatcher ─────────────────────────────────────────────────────
// Concrete branches so each emit() call is properly typed without generic
// indexing into the payload map (which TS narrows poorly).
async function dispatchByEventType(
  eventType: CommEventType,
  args: NotifyAdmsAttendanceArgs,
  subject: StudentSubject | StaffSubject,
): Promise<void> {
  const base = {
    schoolId:    args.schoolId,
    triggeredBy: null,
    metadata:    { source: 'adms', deviceSn: args.deviceSn ?? null } as Record<string, unknown>,
  };
  const time = formatLocalTime(args.checkTime);

  switch (eventType) {
    case 'learner.attendance.checkin': {
      const s = subject as StudentSubject;
      await emit('learner.attendance.checkin', {
        ...base, studentId: s.studentId, studentName: s.studentName,
        classLabel: s.classLabel ?? undefined, time,
      });
      return;
    }
    case 'learner.attendance.checkout': {
      const s = subject as StudentSubject;
      await emit('learner.attendance.checkout', {
        ...base, studentId: s.studentId, studentName: s.studentName, time,
      });
      return;
    }
    case 'staff.attendance.checkin': {
      const s = subject as StaffSubject;
      await emit('staff.attendance.checkin', {
        ...base, staffId: s.staffId, staffName: s.staffName, time,
      });
      return;
    }
    case 'staff.attendance.checkout': {
      const s = subject as StaffSubject;
      await emit('staff.attendance.checkout', {
        ...base, staffId: s.staffId, staffName: s.staffName, time,
      });
      return;
    }
    default:
      return;
  }
}

/** "2026-05-31 09:14:22" → "09:14". Falls back to the raw string when
 *  the input isn't parseable (preserves whatever the device reported
 *  rather than dropping it). */
function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
