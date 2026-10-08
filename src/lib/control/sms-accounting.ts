/**
 * SMS Accounting — Control Center visibility the operator was flying blind
 * without: how many SMS a school actually sends per day, what that implies
 * for the rest of the month at the current rate, and how its parent contact
 * book splits across MTN vs Airtel (relevant because provider routing and
 * per-network delivery/cost can differ).
 *
 * Usage figures read sms_usage_events (the same ledger sms-economics.ts uses
 * for allocation/remaining) — never recomputed from audit logs, which only
 * the single-message composer wrote.
 */
import { query } from '@/lib/control/db';
import { classifyUgandaCarrier, type UgandaCarrier } from '@/lib/sms/carrier';

export interface SchoolSmsRate {
  totalWindow: number;        // segments sent in the trailing window
  activeDaysWindow: number;   // distinct calendar days with a send, in the window
  avgPerActiveDay: number;    // totalWindow / activeDaysWindow (0 when no sends)
  totalThisMonth: number;     // segments sent so far this calendar month
  activeDaysThisMonth: number;
  daysElapsedThisMonth: number;
  daysRemainingThisMonth: number;
  projectedMonthTotal: number; // totalThisMonth + avgPerActiveDay * daysRemainingThisMonth
}

/**
 * Per-school sending rate and a projected month-end total "if the school
 * keeps sending at its current active-day average for the rest of the
 * month." Averaging over ACTIVE days (not the full window) so a school that
 * only just onboarded isn't diluted by days before it existed.
 */
export async function getSmsRateBySchool(windowDays = 30): Promise<Record<number, SchoolSmsRate>> {
  const since = new Date(Date.now() - windowDays * 86_400_000);

  const [windowRows, monthRows] = await Promise.all([
    query(
      `SELECT school_id,
              COALESCE(SUM(segments), 0) AS total,
              COUNT(DISTINCT DATE(created_at)) AS active_days
         FROM sms_usage_events
        WHERE success = 1 AND created_at >= ?
        GROUP BY school_id`,
      [since],
    ).catch(() => []) as Promise<any[]>,
    query(
      `SELECT school_id,
              COALESCE(SUM(segments), 0) AS total,
              COUNT(DISTINCT DATE(created_at)) AS active_days
         FROM sms_usage_events
        WHERE success = 1 AND created_at >= DATE_FORMAT(CURDATE(), '%Y-%m-01')
        GROUP BY school_id`,
      [],
    ).catch(() => []) as Promise<any[]>,
  ]);

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysElapsed = now.getDate();
  const daysRemaining = Math.max(0, daysInMonth - daysElapsed);

  const windowBySchool = new Map<number, { total: number; activeDays: number }>();
  for (const r of windowRows) windowBySchool.set(Number(r.school_id), { total: Number(r.total || 0), activeDays: Number(r.active_days || 0) });

  const monthBySchool = new Map<number, { total: number; activeDays: number }>();
  for (const r of monthRows) monthBySchool.set(Number(r.school_id), { total: Number(r.total || 0), activeDays: Number(r.active_days || 0) });

  const schoolIds = new Set<number>([...windowBySchool.keys(), ...monthBySchool.keys()]);
  const out: Record<number, SchoolSmsRate> = {};
  for (const id of schoolIds) {
    const w = windowBySchool.get(id) ?? { total: 0, activeDays: 0 };
    const m = monthBySchool.get(id) ?? { total: 0, activeDays: 0 };
    // Always rate off the 30-day window, not "this month so far" — on the
    // 1st of the month that's a single day's count standing in for the
    // whole month's projection, which swings wildly on one unusually busy
    // or quiet day. The window already contains this month's data too.
    const avgPerActiveDay = w.activeDays > 0 ? w.total / w.activeDays : 0;
    out[id] = {
      totalWindow: w.total, activeDaysWindow: w.activeDays, avgPerActiveDay,
      totalThisMonth: m.total, activeDaysThisMonth: m.activeDays,
      daysElapsedThisMonth: daysElapsed, daysRemainingThisMonth: daysRemaining,
      projectedMonthTotal: m.total + avgPerActiveDay * daysRemaining,
    };
  }
  return out;
}

export interface CarrierBreakdown { mtn: number; airtel: number; other: number; total: number }

/**
 * Distinct parent/guardian phone numbers per school, classified by carrier.
 * Mirrors notifications/fanout.ts's resolveGuardian() recipient sources
 * (student_contacts → contacts → people, with the legacy parents table as a
 * fallback for students never migrated to the new contacts system) so the
 * count reflects who DRAIS can actually message, not just who's on file.
 * Counts DISTINCT phones per school — a phone shared by siblings' records
 * is one contact, not two.
 */
export async function getParentCarrierBreakdownBySchool(): Promise<Record<number, CarrierBreakdown>> {
  const [viaContacts, viaLegacy] = await Promise.all([
    query(
      `SELECT DISTINCT s.school_id, cp.phone
         FROM students s
         JOIN student_contacts sc ON sc.student_id = s.id
         JOIN contacts con        ON con.id = sc.contact_id
         JOIN people cp           ON cp.id = con.person_id
        WHERE s.deleted_at IS NULL AND s.status = 'active'
          AND cp.phone IS NOT NULL AND cp.phone <> ''`,
      [],
    ).catch(() => []) as Promise<Array<{ school_id: number; phone: string }>>,
    query(
      `SELECT DISTINCT s.school_id, pa.phone
         FROM students s
         JOIN student_parents sp ON sp.student_id = s.id
         JOIN parents pa         ON pa.id = sp.parent_id
        WHERE s.deleted_at IS NULL AND s.status = 'active'
          AND pa.phone IS NOT NULL AND pa.phone <> ''
          AND NOT EXISTS (SELECT 1 FROM student_contacts sc2 WHERE sc2.student_id = s.id)`,
      [],
    ).catch(() => []) as Promise<Array<{ school_id: number; phone: string }>>,
  ]);

  // Dedupe per (school, phone) across both sources before classifying —
  // a school's count should reflect unique reachable numbers.
  const seen = new Set<string>();
  const out: Record<number, CarrierBreakdown> = {};
  const bump = (schoolId: number, carrier: UgandaCarrier) => {
    const row = (out[schoolId] ??= { mtn: 0, airtel: 0, other: 0, total: 0 });
    row[carrier]++; row.total++;
  };
  for (const { school_id, phone } of [...viaContacts, ...viaLegacy]) {
    const key = `${school_id}:${phone}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bump(Number(school_id), classifyUgandaCarrier(phone));
  }
  return out;
}
