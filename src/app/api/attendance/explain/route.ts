/**
 * GET /api/attendance/explain?person_id=&date=&role=
 * Attendance Explanation Engine (Phase 9): the full reasoning behind one
 * person-day verdict — arrival vs cutoff, grace, difference, deciding
 * policy/rule/shift, plain-language reason. Read-only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { explainVerdict } from '@/lib/attendance/explanation';

export const runtime = 'nodejs';

const localMinute = (v: any, offMin: number): number | null => {
  if (!v) return null;
  const l = new Date(new Date(v).getTime() + offMin * 60_000);
  return l.getUTCHours() * 60 + l.getUTCMinutes();
};
const parseTimeToMin = (t: string | null): number | null => {
  if (!t) return null;
  const [h, m] = String(t).split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (m || 0) : null;
};

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const personId = Number(sp.get('person_id'));
  const date = sp.get('date');
  const role = sp.get('role') === 'staff' ? 'staff' : 'student';
  if (!Number.isFinite(personId) || !date) return NextResponse.json({ error: 'person_id and date are required' }, { status: 400 });

  try {
    const off = (await resolveTimePolicy(session.schoolId).catch(() => ({ offsetMinutes: 180 }))).offsetMinutes;
    const recs = (await query(
      `SELECT status, first_in_at, last_out_at, late_minutes, rule_id
         FROM attendance_records
        WHERE school_id = ? AND person_id = ? AND attendance_date = ? LIMIT 1`,
      [session.schoolId, personId, date],
    )) as any[];
    const rec = recs[0];
    if (!rec) return NextResponse.json({ error: 'No verdict for this person/date' }, { status: 404 });

    const ruleId = rec.rule_id == null ? null : Number(rec.rule_id);
    const isShift = ruleId != null && ruleId < 0;
    let arrivalEndMin: number | null = null, grace = 0, ruleLabel: string | null = null, hadOverride = false;

    if (ruleId != null && !isShift) {
      const rules = (await query(
        `SELECT rule_name, arrival_end_time, late_threshold_minutes FROM attendance_rules WHERE id = ? LIMIT 1`,
        [ruleId],
      )) as any[];
      if (rules[0]) {
        ruleLabel = rules[0].rule_name || `rule #${ruleId}`;
        arrivalEndMin = parseTimeToMin(rules[0].arrival_end_time);
        grace = Number(rules[0].late_threshold_minutes || 0);
        // Weekday override, if the day-overrides layer had one for this date.
        const ov = (await query(
          `SELECT arrival_end_time, late_threshold_minutes FROM attendance_rule_day_overrides
            WHERE rule_id = ? AND weekday = ? LIMIT 1`,
          [ruleId, new Date(`${date}T00:00:00`).getDay()],
        ).catch(() => [])) as any[];
        if (ov[0]) {
          hadOverride = true;
          if (ov[0].arrival_end_time) arrivalEndMin = parseTimeToMin(ov[0].arrival_end_time);
          if (ov[0].late_threshold_minutes != null) grace = Number(ov[0].late_threshold_minutes);
        }
      }
    } else if (isShift) {
      ruleLabel = 'assigned staff shift';
    }

    const holidayRows = (await query(
      `SELECT 1 FROM holidays WHERE holiday_date = ? AND (school_id = ? OR school_id IS NULL) LIMIT 1`,
      [date, session.schoolId],
    ).catch(() => [])) as any[];

    const explanation = explainVerdict({
      status: rec.status,
      arrivalMinute: localMinute(rec.first_in_at, off),
      departureMinute: localMinute(rec.last_out_at, off),
      arrivalEndMinute: arrivalEndMin,
      graceMinutes: grace,
      lateMinutes: Number(rec.late_minutes || 0),
      ruleLabel, ruleId, isShift, hadWeekdayOverride: hadOverride,
      isHoliday: holidayRows.length > 0,
    });

    return NextResponse.json({ success: true, date, status: rec.status, explanation });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
