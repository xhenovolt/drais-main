/**
 * THE single decision point for attendance-triggered SMS.
 *
 * Pure: given the learner's residence, the school's boarding policy, the attendance verdict and
 * the punch/report facts, it returns SEND or DO_NOT_SEND, the notification type, a machine-readable
 * reason code, plain-language explanation lines, and the structured facts that were used. The same
 * object is stored with every SMS (and with every suppression) so "why was this sent?" is answerable
 * from inside DRAIS without reading code.
 *
 *                     DAY / DAILY_PUNCH boarding      BOARDING + REPORTED_ONCE
 *   punch on time     ARRIVAL_ON_TIME                 BOARDING_REPORTED (first of period only)
 *   punch late        LATE_ARRIVAL                    BOARDING_REPORTED (first of period only)
 *   no punch          ABSENT                          nothing (no daily absence for boarders)
 *   policy-derived    nothing                         nothing
 *
 * On top of the matrix, the safety gates from attendance-sms-eligibility.ts still apply
 * (fresh date, real punch evidence, biometric enrolment for absences).
 */
import type { EligibilityVerdict } from '@/lib/notifications/attendance-sms-eligibility';
import type { BoardingMode } from './boarding-policy';

export type NotificationType =
  | 'ARRIVAL_ON_TIME' | 'LATE_ARRIVAL' | 'ABSENT' | 'HALF_DAY' | 'EARLY_LEAVE' | 'NON_SESSION_DAY'
  | 'BOARDING_REPORTED';

export type Residence = 'day' | 'boarding';

export interface DecisionInput {
  status: 'present' | 'late' | 'absent' | 'half_day' | 'early_leave' | 'holiday' | 'weekend';
  attendanceDate: string;
  firstInAt: string | null;
  isPolicyDerived: boolean;
  policyDerivedReason: string | null;
  residence: Residence | null;
  boardingMode: BoardingMode | null;
  boardingReport: { periodKey: string; periodLabel: string; isNew: boolean } | null;
  reportedSmsEnabled: boolean;
  eligibility: EligibilityVerdict;
  ruleId: number | null;
}

export interface Decision {
  decision: 'SEND' | 'DO_NOT_SEND';
  notificationType: NotificationType;
  reasonCode: string;
  explanation: string[];
  facts: Record<string, unknown>;
}

const TYPE_BY_STATUS: Record<DecisionInput['status'], NotificationType> = {
  present: 'ARRIVAL_ON_TIME', late: 'LATE_ARRIVAL', absent: 'ABSENT', half_day: 'HALF_DAY',
  early_leave: 'EARLY_LEAVE', holiday: 'NON_SESSION_DAY', weekend: 'NON_SESSION_DAY',
};
const PUNCH_BACKED = new Set(['present', 'late', 'half_day', 'early_leave']);

const residenceText = (r: Residence | null) => (r === 'boarding' ? 'Boarding' : r === 'day' ? 'Day scholar' : 'Not classified');

export function decideAttendanceNotification(i: DecisionInput): Decision {
  const facts: Record<string, unknown> = {
    residence: i.residence, boardingPolicy: i.boardingMode, attendanceStatus: i.status, attendanceDate: i.attendanceDate,
    firstPunchAt: i.firstInAt, policyDerived: i.isPolicyDerived, policyDerivedReason: i.policyDerivedReason,
    reportingPeriod: i.boardingReport?.periodLabel ?? null, firstReportThisPeriod: i.boardingReport?.isNew ?? null,
    ruleId: i.ruleId,
  };
  const head = [
    `Residence: ${residenceText(i.residence)}`,
    ...(i.residence === 'boarding' ? [`Boarding policy: ${i.boardingMode === 'REPORTED_ONCE' ? 'Reported once' : 'Daily punch'}`] : []),
    `Attendance result: ${i.status.replace('_', ' ')}`,
  ];
  const out = (decision: Decision['decision'], notificationType: NotificationType, reasonCode: string, more: string[]): Decision =>
    ({ decision, notificationType, reasonCode, explanation: [...head, ...more], facts });

  if (i.isPolicyDerived) {
    return out('DO_NOT_SEND', TYPE_BY_STATUS[i.status], 'policy_derived_verdict',
      [`No message: this result came from a school policy${i.policyDerivedReason ? ` (${i.policyDerivedReason.replace(/_/g, ' ')})` : ''}, not from a punch.`]);
  }

  if (i.residence === 'boarding' && i.boardingMode === 'REPORTED_ONCE') {
    if (PUNCH_BACKED.has(i.status)) {
      const type: NotificationType = 'BOARDING_REPORTED';
      if (!i.reportedSmsEnabled) {
        return out('DO_NOT_SEND', type, 'reported_sms_disabled', ['No message: "reported to school" SMS is switched off for this school.']);
      }
      if (!i.boardingReport?.isNew) {
        return out('DO_NOT_SEND', type, 'already_reported_this_period',
          [`No message: this learner already reported during ${i.boardingReport?.periodLabel ?? 'the current reporting period'}.`]);
      }
      if (!i.eligibility.eligible) {
        return out('DO_NOT_SEND', type, i.eligibility.reason, [`No message: ${i.eligibility.reason.replace(/_/g, ' ')}.`]);
      }
      return out('SEND', type, 'first_report_this_period',
        [`First valid arrival punch in ${i.boardingReport.periodLabel}: send "reported to school" (not a late or absence message).`]);
    }
    return out('DO_NOT_SEND', TYPE_BY_STATUS[i.status], 'boarding_reported_once_no_daily_absence',
      ['No message: under "Reported once" a boarder is not treated as absent for not punching every day.']);
  }

  const type = TYPE_BY_STATUS[i.status];
  if (!i.eligibility.eligible) {
    return out('DO_NOT_SEND', type, i.eligibility.reason, [`No message: ${i.eligibility.reason.replace(/_/g, ' ')}.`]);
  }
  return out('SEND', type, 'daily_rule',
    [i.residence === 'boarding' ? 'Boarding learner on "Daily punch": the same rules as day scholars apply.' : 'Day scholar: the daily attendance rules apply.']);
}

/** Admin-friendly text for a reason code (used by the SMS details view). */
export const REASON_TEXT: Record<string, string> = {
  first_report_this_period: 'First valid report in the current reporting period.',
  already_reported_this_period: 'The learner had already reported in this reporting period.',
  reported_sms_disabled: 'The "reported to school" SMS is switched off.',
  boarding_reported_once_no_daily_absence: 'Boarders on "Reported once" are not marked absent daily.',
  policy_derived_verdict: 'The result came from a school policy, not a punch.',
  daily_rule: 'Normal daily attendance rule.',
  not_biometrically_enrolled: 'The learner is not enrolled on a biometric device, so absence cannot be claimed.',
  no_device_evidence: 'No proof the learner was ever set up on a device.',
  stale_attendance_date: 'The attendance date was too old to notify a parent about.',
  future_date: 'The attendance date is in the future.',
  no_punch_evidence: 'There was no real punch behind this result.',
};
