/**
 * School-level BOARDING attendance policy.
 *
 *  DAILY_PUNCH   Boarders are expected to punch every relevant school day, exactly like day scholars
 *                (this is the default and the behaviour every school had before this policy existed).
 *  REPORTED_ONCE A boarder is "reported" after their first valid arrival punch in the reporting period
 *                (term / week / N days). They are NOT treated as absent for not punching again, and the
 *                parent gets one BOARDING_REPORTED SMS — not a late-arrival or absence message.
 *
 * "Reported to school" and "present today" are different facts and are kept separate:
 *  reported  = a row in boarding_reports for the current period;
 *  present   = a real punch today (attendance_records, not policy-derived).
 *
 * Changing the mode never rewrites history: previous_mode/effective_from mean dates before the
 * change keep evaluating under the old mode.
 */
import { query } from '@/lib/db';
import { logAudit } from '@/lib/audit';

export type BoardingMode = 'DAILY_PUNCH' | 'REPORTED_ONCE';
export type ReportingPeriodKind = 'TERM' | 'WEEK' | 'CUSTOM_DAYS';

export interface BoardingPolicy {
  mode: BoardingMode;
  previousMode: BoardingMode | null;
  effectiveFrom: string | null;         // YYYY-MM-DD
  reportingPeriod: ReportingPeriodKind;
  periodDays: number | null;            // only for CUSTOM_DAYS
  reportedSmsEnabled: boolean;
}

export const DEFAULT_BOARDING_POLICY: BoardingPolicy = {
  mode: 'DAILY_PUNCH', previousMode: null, effectiveFrom: null,
  reportingPeriod: 'TERM', periodDays: null, reportedSmsEnabled: true,
};

export interface ReportingPeriod { key: string; start: string; end: string; label: string; kind: ReportingPeriodKind | 'FALLBACK' }

const DAY_MS = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** ISO week (Mon-Sun) containing the date. */
function isoWeek(date: string): { key: string; start: string; end: string } {
  const t = dayMs(date);
  const dow = (new Date(t).getUTCDay() + 6) % 7; // Mon=0
  const start = t - dow * DAY_MS;
  const thursday = start + 3 * DAY_MS;
  const year = new Date(thursday).getUTCFullYear();
  const jan1 = Date.UTC(year, 0, 1);
  const week = 1 + Math.floor((thursday - jan1) / (7 * DAY_MS));
  return { key: `week:${year}-W${String(week).padStart(2, '0')}`, start: ymd(start), end: ymd(start + 6 * DAY_MS) };
}

/**
 * The reporting period a date falls in. TERM uses the school's term for that date; when the school has
 * no term covering it we fall back to a 90-day window so a boarder is still reported exactly once
 * (never once per day) rather than silently misbehaving.
 */
export function resolveReportingPeriod(
  policy: Pick<BoardingPolicy, 'reportingPeriod' | 'periodDays'>,
  date: string,
  term: { id: number; start: string; end: string; name?: string } | null,
): ReportingPeriod {
  if (policy.reportingPeriod === 'WEEK') {
    const w = isoWeek(date);
    return { ...w, label: `Week of ${w.start}`, kind: 'WEEK' };
  }
  if (policy.reportingPeriod === 'CUSTOM_DAYS') {
    const n = Math.min(365, Math.max(1, Math.round(policy.periodDays ?? 14)));
    const idx = Math.floor(dayMs(date) / DAY_MS / n);
    const start = idx * n * DAY_MS;
    return { key: `days:${n}:${idx}`, start: ymd(start), end: ymd(start + (n - 1) * DAY_MS), label: `${n}-day period from ${ymd(start)}`, kind: 'CUSTOM_DAYS' };
  }
  if (term) {
    return { key: `term:${term.id}`, start: term.start, end: term.end, label: term.name ? `${term.name}` : `Term ${term.id}`, kind: 'TERM' };
  }
  const idx = Math.floor(dayMs(date) / DAY_MS / 90);
  const start = idx * 90 * DAY_MS;
  return { key: `fallback90:${idx}`, start: ymd(start), end: ymd(start + 89 * DAY_MS), label: `90-day period from ${ymd(start)} (no term set up)`, kind: 'FALLBACK' };
}

/** The mode that governs a given attendance date (history is protected across policy changes). */
export function modeForDate(policy: BoardingPolicy, date: string): BoardingMode {
  if (policy.effectiveFrom && date < policy.effectiveFrom) return policy.previousMode ?? 'DAILY_PUNCH';
  return policy.mode;
}

export function sanitizeBoardingPolicy(patch: Record<string, unknown>, base: BoardingPolicy = DEFAULT_BOARDING_POLICY): BoardingPolicy {
  const mode: BoardingMode = patch.mode === 'REPORTED_ONCE' || patch.mode === 'DAILY_PUNCH' ? patch.mode : base.mode;
  const rp: ReportingPeriodKind = ['TERM', 'WEEK', 'CUSTOM_DAYS'].includes(patch.reportingPeriod as string) ? (patch.reportingPeriod as ReportingPeriodKind) : base.reportingPeriod;
  const n = Number(patch.periodDays);
  return {
    mode, previousMode: base.previousMode, effectiveFrom: base.effectiveFrom,
    reportingPeriod: rp,
    periodDays: rp === 'CUSTOM_DAYS' ? (Number.isFinite(n) && n >= 1 ? Math.min(365, Math.round(n)) : base.periodDays ?? 14) : null,
    reportedSmsEnabled: patch.reportedSmsEnabled === undefined ? base.reportedSmsEnabled : !!patch.reportedSmsEnabled,
  };
}

// ── DB ─────────────────────────────────────────────────────────────────────

const cache = new Map<number, { exp: number; p: BoardingPolicy }>();

export async function getBoardingPolicy(schoolId: number, fresh = false): Promise<BoardingPolicy> {
  const c = cache.get(schoolId);
  if (!fresh && c && c.exp > Date.now()) return c.p;
  let p = DEFAULT_BOARDING_POLICY;
  try {
    const r = ((await query(
      `SELECT mode, previous_mode, effective_from, reporting_period, period_days, reported_sms_enabled
         FROM attendance_boarding_policy WHERE school_id = ? LIMIT 1`, [schoolId],
    )) as any[])[0];
    if (r) {
      p = {
        mode: r.mode === 'REPORTED_ONCE' ? 'REPORTED_ONCE' : 'DAILY_PUNCH',
        previousMode: r.previous_mode === 'REPORTED_ONCE' ? 'REPORTED_ONCE' : r.previous_mode === 'DAILY_PUNCH' ? 'DAILY_PUNCH' : null,
        effectiveFrom: r.effective_from ? String(r.effective_from instanceof Date ? r.effective_from.toISOString() : r.effective_from).slice(0, 10) : null,
        reportingPeriod: (['TERM', 'WEEK', 'CUSTOM_DAYS'].includes(r.reporting_period) ? r.reporting_period : 'TERM') as ReportingPeriodKind,
        periodDays: r.period_days != null ? Number(r.period_days) : null,
        reportedSmsEnabled: Number(r.reported_sms_enabled) === 1,
      };
    }
  } catch { /* table not migrated -> defaults (DAILY_PUNCH) */ }
  cache.set(schoolId, { exp: Date.now() + 30_000, p });
  return p;
}

/** Save the school's policy. Records who/when/previous/new in the audit log; never touches history. */
export async function saveBoardingPolicy(
  schoolId: number, userId: number, patch: Record<string, unknown>, today: string,
): Promise<{ policy: BoardingPolicy; changed: boolean }> {
  const before = await getBoardingPolicy(schoolId, true);
  const next = sanitizeBoardingPolicy(patch, before);
  const modeChanged = next.mode !== before.mode;
  next.previousMode = modeChanged ? before.mode : before.previousMode;
  next.effectiveFrom = modeChanged ? today : before.effectiveFrom;

  await query(
    `INSERT INTO attendance_boarding_policy
       (school_id, mode, previous_mode, effective_from, reporting_period, period_days, reported_sms_enabled, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE mode = VALUES(mode), previous_mode = VALUES(previous_mode),
       effective_from = VALUES(effective_from), reporting_period = VALUES(reporting_period),
       period_days = VALUES(period_days), reported_sms_enabled = VALUES(reported_sms_enabled), updated_by = VALUES(updated_by)`,
    [schoolId, next.mode, next.previousMode, next.effectiveFrom, next.reportingPeriod, next.periodDays, next.reportedSmsEnabled ? 1 : 0, userId],
  );
  cache.delete(schoolId);
  const changed = JSON.stringify(before) !== JSON.stringify(next);
  if (changed) {
    await logAudit({
      schoolId, userId, action: 'BOARDING_POLICY_CHANGED', entityType: 'attendance_boarding_policy', entityId: schoolId,
      details: { from: before, to: next, effectiveFrom: next.effectiveFrom },
    });
  }
  return { policy: next, changed };
}

export async function getTermForDate(schoolId: number, date: string): Promise<{ id: number; start: string; end: string; name?: string } | null> {
  try {
    const r = ((await query(
      `SELECT id, name, start_date, end_date FROM terms
        WHERE school_id = ? AND deleted_at IS NULL AND start_date <= ? AND end_date >= ?
        ORDER BY is_active DESC, start_date DESC LIMIT 1`, [schoolId, date, date],
    )) as any[])[0];
    if (!r) return null;
    const d = (v: any) => String(v instanceof Date ? v.toISOString() : v).slice(0, 10);
    return { id: Number(r.id), name: r.name ?? undefined, start: d(r.start_date), end: d(r.end_date) };
  } catch { return null; }
}

export async function getPeriodFor(schoolId: number, policy: BoardingPolicy, date: string): Promise<ReportingPeriod> {
  const term = policy.reportingPeriod === 'TERM' ? await getTermForDate(schoolId, date) : null;
  return resolveReportingPeriod(policy, date, term);
}

/**
 * Record that a boarder has reported for this period. Idempotent on (school, learner, period):
 * returns isNew=true only for the FIRST report, which is what triggers the one BOARDING_REPORTED SMS.
 */
export async function recordBoardingReport(p: {
  schoolId: number; studentId: number; personId: number; period: ReportingPeriod;
  attendanceDate: string; reportedAt: Date; firstPunchEventId?: number | null;
}): Promise<{ isNew: boolean }> {
  const res = (await query(
    `INSERT IGNORE INTO boarding_reports
       (school_id, student_id, person_id, period_key, period_start, period_end, reported_at, attendance_date, first_punch_event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [p.schoolId, p.studentId, p.personId, p.period.key, p.period.start, p.period.end, p.reportedAt, p.attendanceDate, p.firstPunchEventId ?? null],
  )) as unknown as { affectedRows?: number };
  return { isNew: (res?.affectedRows ?? 0) > 0 };
}

export async function hasReported(schoolId: number, studentId: number, periodKey: string): Promise<boolean> {
  const r = (await query(
    `SELECT 1 FROM boarding_reports WHERE school_id = ? AND student_id = ? AND period_key = ? LIMIT 1`,
    [schoolId, studentId, periodKey],
  )) as any[];
  return r.length > 0;
}
