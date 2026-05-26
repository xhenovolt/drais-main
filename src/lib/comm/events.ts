/**
 * Communication event catalog.
 *
 * Every place in DRAIS that wants to notify someone (parent, staff,
 * admin) emits one of these typed events. The dispatcher resolves
 * templates and rules per school + event_type and decides whether to
 * actually send anything.
 *
 * Adding a new event:
 *   1. Append a CommEventType union member.
 *   2. Add its payload to CommEventPayloadMap.
 *   3. Seed a default template in src/lib/comm/seed-templates.ts.
 *   4. Call emit('your.event', payload) from the originating code path.
 */

export type CommEventType =
  // Attendance
  | 'learner.attendance.checkin'
  | 'learner.attendance.checkout'
  | 'learner.attendance.late'
  | 'learner.attendance.absent'
  | 'staff.attendance.checkin'
  | 'staff.attendance.checkout'
  // Academic
  | 'report.generated'
  | 'result.deadline.reminder'
  | 'exam.result.published'
  | 'performance.alert'
  // Finance
  | 'finance.payment.received'
  | 'finance.fee.overdue'
  | 'finance.waiver.approved'
  // Discipline
  | 'discipline.incident'
  // Auth / security
  | 'auth.otp'
  | 'auth.password.reset'
  | 'auth.login.suspicious'
  // Operational broadcasts
  | 'broadcast.general';

export interface CommEventBase {
  schoolId:      number;
  triggeredBy?:  number | null;  // user_id if manual; null for system
  source?:       'auto' | 'manual';
}

/**
 * One payload shape per event. The dispatcher uses this map both to
 * type-check emit() calls and to expand template placeholders.
 *
 * Convention: include enough resolved data so the template renderer
 * never needs a second DB lookup. e.g. include studentName, not just
 * studentId.
 */
export interface CommEventPayloadMap {
  'learner.attendance.checkin':  CommEventBase & { studentId: number; studentName: string; time: string; classLabel?: string };
  'learner.attendance.checkout': CommEventBase & { studentId: number; studentName: string; time: string };
  'learner.attendance.late':     CommEventBase & { studentId: number; studentName: string; time: string; minutesLate?: number };
  'learner.attendance.absent':   CommEventBase & { studentId: number; studentName: string; date: string };
  'staff.attendance.checkin':    CommEventBase & { staffId: number; staffName: string; time: string };
  'staff.attendance.checkout':   CommEventBase & { staffId: number; staffName: string; time: string };
  'report.generated':            CommEventBase & { studentId: number; studentName: string; termName: string; downloadUrl?: string };
  'result.deadline.reminder':    CommEventBase & { teacherName: string; deadlineLabel: string; daysLeft: number };
  'exam.result.published':       CommEventBase & { studentId: number; studentName: string; examName: string };
  'performance.alert':           CommEventBase & { studentId: number; studentName: string; metric: string; value: string };
  'finance.payment.received':    CommEventBase & { studentId: number; studentName: string; amount: number; receiptNo?: string };
  'finance.fee.overdue':         CommEventBase & { studentId: number; studentName: string; balance: number; daysOverdue?: number };
  'finance.waiver.approved':     CommEventBase & { studentId: number; studentName: string; amount: number };
  'discipline.incident':         CommEventBase & { studentId: number; studentName: string; summary: string };
  'auth.otp':                    CommEventBase & { userId: number; phone: string; code: string; ttlMinutes?: number };
  'auth.password.reset':         CommEventBase & { userId: number; phone: string; code: string };
  'auth.login.suspicious':       CommEventBase & { userId: number; phone: string; deviceLabel?: string; ip?: string };
  'broadcast.general':           CommEventBase & { audienceLabel: string; message: string };
}

/** Audiences a rule can target. Resolved into recipient phone numbers
 *  by recipients.ts at dispatch time. */
export type CommAudience =
  | 'parents'
  | 'guardians'
  | 'class_teacher'
  | 'headteacher'
  | 'directors'
  | 'self'        // the subject of the event (the learner's account / the staff member)
  | 'custom';     // uses comm_rules.custom_phones JSON

export type CommChannel = 'sms' | 'email' | 'whatsapp' | 'push' | 'in_app';

export const ALL_EVENT_TYPES: CommEventType[] = [
  'learner.attendance.checkin',
  'learner.attendance.checkout',
  'learner.attendance.late',
  'learner.attendance.absent',
  'staff.attendance.checkin',
  'staff.attendance.checkout',
  'report.generated',
  'result.deadline.reminder',
  'exam.result.published',
  'performance.alert',
  'finance.payment.received',
  'finance.fee.overdue',
  'finance.waiver.approved',
  'discipline.incident',
  'auth.otp',
  'auth.password.reset',
  'auth.login.suspicious',
  'broadcast.general',
];
