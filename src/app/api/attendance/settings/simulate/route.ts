/**
 * POST /api/attendance/settings/simulate
 *
 * Phase 5 — rule sandbox. Feed a sequence of punch times (HH:MM) for a
 * day and see exactly how the CURRENT saved rule classifies each one,
 * plus the resulting day status. Proves the settings are wired to the
 * real evaluator (same deriveEvents/evaluate used by the engine).
 *
 * Body: { role?: 'students'|'teachers', date?: 'YYYY-MM-DD', times: ['08:42','16:50'] }
 * Returns: { rule, events: [{time, type, label, detail}], day: {status, ...} }
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { evaluate, deriveEvents, type AttendanceRule } from '@/lib/attendance/rule-evaluator';

export const runtime = 'nodejs';

const LABEL: Record<string, string> = {
  ARRIVED: 'Arrived (on time)', ARRIVED_LATE: 'Late arrival', ARRIVED_EARLY: 'Arrived early',
  TEMP_EXIT: 'Stepped out', RETURNED: 'Returned',
  CHECKED_OUT: 'Checked out', EARLY_DEPARTURE: 'Left early', OVERTIME_EXIT: 'Overtime exit',
  DUPLICATE: 'Duplicate (ignored)',
};

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const role = body?.role === 'teachers' ? 'teachers' : 'students';
  const times: string[] = Array.isArray(body?.times) ? body.times.filter((t: any) => /^\d{1,2}:\d{2}$/.test(String(t))) : [];
  if (times.length === 0) return NextResponse.json({ error: 'Provide times[] like ["08:42","16:50"]' }, { status: 400 });
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(body?.date) ? body.date : new Date().toISOString().slice(0, 10);

  // Load the school's active rule for the role — the SAME query the
  // engine uses, so the sandbox reflects exactly what runs in production.
  const appliesTo = role === 'teachers' ? "('teachers','all')" : "('students','all')";
  const rows = (await query(
    `SELECT id, arrival_start_time, arrival_end_time, late_threshold_minutes,
            absence_cutoff_time, closing_time, departure_start_time, departure_end_time,
            early_leave_threshold_minutes, half_day_threshold_minutes,
            weekday_mask, applies_on_holidays, boarding_scope, applies_to,
            ignore_duplicate_scans_within_minutes
       FROM attendance_rules
      WHERE school_id = ? AND is_active = 1 AND applies_to IN ${appliesTo}
      ORDER BY priority ASC LIMIT 1`,
    [session.schoolId],
  )) as Array<Record<string, unknown>>;

  if (rows.length === 0) {
    return NextResponse.json({ error: `No active attendance rule for ${role}. Save one in settings first.`, no_rule: true }, { status: 404 });
  }
  const r = rows[0];
  const rule: AttendanceRule = {
    id: r.id as number,
    arrival_start_time: (r.arrival_start_time as string) ?? null,
    arrival_end_time: (r.arrival_end_time as string) ?? null,
    late_threshold_minutes: Number(r.late_threshold_minutes ?? 15),
    absence_cutoff_time: (r.absence_cutoff_time as string) ?? null,
    closing_time: (r.closing_time as string) ?? null,
    departure_start_time: (r.departure_start_time as string) ?? null,
    departure_end_time: (r.departure_end_time as string) ?? null,
    early_leave_threshold_minutes: Number(r.early_leave_threshold_minutes ?? 30),
    half_day_threshold_minutes: Number(r.half_day_threshold_minutes ?? 240),
    weekday_mask: Number(r.weekday_mask ?? 31),
    applies_on_holidays: Boolean(r.applies_on_holidays),
    boarding_scope: (r.boarding_scope as 'all' | 'boarding' | 'day') ?? 'all',
    applies_to: (r.applies_to as 'students' | 'teachers' | 'all') ?? 'students',
    ignore_duplicate_scans_within_minutes: Number(r.ignore_duplicate_scans_within_minutes ?? 2),
  };

  const punches = times.map(t => {
    const [hh, mm] = t.split(':').map(Number);
    const d = new Date(`${dateStr}T00:00:00`);
    d.setHours(hh, mm, 0, 0);
    return { punch_at: d, device_sn: 'SANDBOX' };
  });
  const ctx = { attendanceDate: new Date(`${dateStr}T00:00:00`), isHoliday: false, personRole: (role === 'teachers' ? 'staff' : 'student') as 'student' | 'staff' };

  const derived = deriveEvents(rule, punches, ctx);
  const verdict = evaluate(rule, punches, ctx);

  return NextResponse.json({
    success: true,
    role, date: dateStr,
    rule: {
      arrival: `${rule.arrival_start_time ?? '—'}–${rule.arrival_end_time ?? '—'} (+${rule.late_threshold_minutes}m grace)`,
      checkout: `${rule.departure_start_time ?? '—'}–${rule.departure_end_time ?? '—'}`,
      closing: rule.closing_time ?? '—',
      half_day_under_min: rule.half_day_threshold_minutes,
    },
    events: derived.map((e, i) => ({
      time: times[i] ?? null,
      type: e.type,
      label: LABEL[e.type] ?? e.type,
      detail: e.detail,
    })),
    day: { status: verdict.status, late_minutes: verdict.lateMinutes, early_minutes: verdict.earlyMinutes, total_minutes: verdict.totalMinutes, trace: verdict.trace },
  });
}
