/**
 * School attendance breakdown by residence (day / boarding) × gender × outcome, for one date.
 *
 * ONE grouped query feeds everything (no per-widget queries). The numbers are derived from the
 * underlying student / enrolment / attendance rows and the school's boarding policy — nothing is
 * hard-coded — and `reconcile()` proves they add up, surfacing any mismatch instead of hiding it.
 *
 * Outcome buckets for each learner today:
 *   present / late          a real punch (biometric evidence)
 *   absent                  a finalised absence
 *   awaiting                no attendance record yet (has not punched, day not closed)
 *   reportedNotRequired     boarder on "Reported once" who reported earlier and needn't punch today
 *   notReported             boarder on "Reported once" who has not reported yet this period
 *   policyPresent/other     other school-policy-derived results (e.g. leave)
 *   other                   holiday / weekend etc.
 *
 * "Reported to school" (a period fact) is counted separately from "present today" (a punch today).
 */
import { query } from '@/lib/db';

export type Bucket =
  | 'present' | 'late' | 'absent' | 'awaiting' | 'reportedNotRequired' | 'notReported'
  | 'policyPresent' | 'policyOther' | 'other';
export type Residence = 'day' | 'boarding';
export type Gender = 'female' | 'male' | 'unknown';

export interface Row { residence: Residence; gender: Gender; bucket: Bucket; reported: 0 | 1; n: number }

export interface Stats {
  total: number;
  present: number; late: number; absent: number; awaiting: number;
  reportedNotRequired: number; notReported: number; policyPresent: number; policyOther: number; other: number;
  reported: number;
  presentToday: number;
}

const emptyStats = (): Stats => ({
  total: 0, present: 0, late: 0, absent: 0, awaiting: 0, reportedNotRequired: 0, notReported: 0,
  policyPresent: 0, policyOther: 0, other: 0, reported: 0, presentToday: 0,
});

const BUCKETS: Bucket[] = ['present', 'late', 'absent', 'awaiting', 'reportedNotRequired', 'notReported', 'policyPresent', 'policyOther', 'other'];

export interface Breakdown {
  date: string;
  boardingMode: 'DAILY_PUNCH' | 'REPORTED_ONCE';
  reportingPeriod: string | null;
  overall: Stats;
  residence: Record<Residence, Stats>;
  gender: Record<Gender, Stats>;
  cells: Record<Gender, Record<Residence, Stats>>;
  reconciliation: { ok: boolean; issues: string[] };
}

function add(s: Stats, r: Row) {
  s.total += r.n;
  s[r.bucket] += r.n;
  if (r.reported) s.reported += r.n;
  if (r.bucket === 'present' || r.bucket === 'late') s.presentToday += r.n;
}

const sumBuckets = (s: Stats) => BUCKETS.reduce((a, b) => a + s[b], 0);

/** Every equation that must hold. Returns human-readable descriptions of any that don't. */
export function reconcile(b: Omit<Breakdown, 'reconciliation'>): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const t = b.overall.total;
  if (b.residence.day.total + b.residence.boarding.total !== t) issues.push(`Day (${b.residence.day.total}) + Boarding (${b.residence.boarding.total}) does not equal total learners (${t}).`);
  const g = b.gender.female.total + b.gender.male.total + b.gender.unknown.total;
  if (g !== t) issues.push(`Girls + Boys + Not recorded (${g}) does not equal total learners (${t}).`);
  if (sumBuckets(b.overall) !== t) issues.push(`Outcome groups (${sumBuckets(b.overall)}) do not add up to total learners (${t}).`);
  for (const gen of ['female', 'male', 'unknown'] as Gender[]) {
    const cell = b.cells[gen];
    if (cell.day.total + cell.boarding.total !== b.gender[gen].total) issues.push(`${gen}: Day + Boarding does not equal the ${gen} total.`);
    for (const res of ['day', 'boarding'] as Residence[]) {
      if (sumBuckets(cell[res]) !== cell[res].total) issues.push(`${gen} ${res}: outcome groups do not add up.`);
    }
  }
  const bd = b.residence.boarding;
  if (bd.reported > bd.total) issues.push(`Boarding reported (${bd.reported}) exceeds boarding learners (${bd.total}).`);
  if (bd.reportedNotRequired > bd.reported) issues.push(`Boarders marked "reported earlier" (${bd.reportedNotRequired}) exceed boarders who have reported (${bd.reported}).`);
  return { ok: issues.length === 0, issues };
}

export function buildBreakdown(rows: Row[], ctx: { date: string; boardingMode: 'DAILY_PUNCH' | 'REPORTED_ONCE'; reportingPeriod: string | null }): Breakdown {
  const overall = emptyStats();
  const residence: Record<Residence, Stats> = { day: emptyStats(), boarding: emptyStats() };
  const gender: Record<Gender, Stats> = { female: emptyStats(), male: emptyStats(), unknown: emptyStats() };
  const cells = {
    female: { day: emptyStats(), boarding: emptyStats() },
    male: { day: emptyStats(), boarding: emptyStats() },
    unknown: { day: emptyStats(), boarding: emptyStats() },
  } as Record<Gender, Record<Residence, Stats>>;

  for (const r of rows) {
    add(overall, r); add(residence[r.residence], r); add(gender[r.gender], r); add(cells[r.gender][r.residence], r);
  }
  const base = { date: ctx.date, boardingMode: ctx.boardingMode, reportingPeriod: ctx.reportingPeriod, overall, residence, gender, cells };
  return { ...base, reconciliation: reconcile(base as Breakdown) };
}

// ── SQL ────────────────────────────────────────────────────────────────────

const GENDER_SQL = `CASE WHEN LOWER(TRIM(p.gender)) IN ('female','f') THEN 'female'
                         WHEN LOWER(TRIM(p.gender)) IN ('male','m') THEN 'male' ELSE 'unknown' END`;

const BUCKET_SQL = `CASE
    WHEN ar.id IS NULL THEN 'awaiting'
    WHEN ar.is_policy_derived = 1 THEN
      CASE WHEN ar.policy_derived_reason = 'boarding_reported_once' THEN 'reportedNotRequired'
           WHEN ar.policy_derived_reason = 'boarding_not_reported' THEN 'notReported'
           WHEN ar.status = 'present' THEN 'policyPresent' ELSE 'policyOther' END
    WHEN ar.status IN ('present', 'early_leave', 'half_day') THEN 'present'
    WHEN ar.status = 'late' THEN 'late'
    WHEN ar.status = 'absent' THEN 'absent'
    ELSE 'other' END`;

export async function loadBreakdownRows(schoolId: number, date: string, periodKey: string | null, classId?: number): Promise<Row[]> {
  const rows = (await query(
    `SELECT COALESCE(NULLIF(s.residency_status, ''), 'day') AS residence,
            ${GENDER_SQL} AS gender,
            ${BUCKET_SQL} AS bucket,
            CASE WHEN br.id IS NULL THEN 0 ELSE 1 END AS reported,
            COUNT(*) AS n
       FROM students s
       JOIN people p ON p.id = s.person_id
       LEFT JOIN attendance_records ar
              ON ar.school_id = s.school_id AND ar.person_id = s.person_id
             AND ar.role_type = 'student' AND ar.attendance_date = ?
       LEFT JOIN boarding_reports br
              ON br.school_id = s.school_id AND br.student_id = s.id AND br.period_key = ?
      WHERE s.school_id = ? AND s.deleted_at IS NULL AND s.person_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM enrollments e
                     WHERE e.student_id = s.id AND e.status = 'active' AND e.deleted_at IS NULL
                     ${classId ? 'AND e.class_id = ?' : ''})
      GROUP BY residence, gender, bucket, reported`,
    classId ? [date, periodKey ?? '', schoolId, classId] : [date, periodKey ?? '', schoolId],
  )) as any[];
  return rows.map((r) => ({
    residence: r.residence === 'boarding' ? 'boarding' : 'day',
    gender: r.gender as Gender, bucket: r.bucket as Bucket, reported: Number(r.reported) === 1 ? 1 : 0, n: Number(r.n),
  }));
}
