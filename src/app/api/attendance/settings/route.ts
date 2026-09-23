import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { ensureDayOverrideSchema, saveRuleDayOverrides } from '@/lib/attendance/day-overrides';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/settings
 * Fetch the active attendance rule for the current school.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // Return ALL active scope rules so the UI can configure learners and staff
    // (and an "everyone" default) separately. `rule` is kept for back-compat.
    const rows = (await query(
      `SELECT * FROM attendance_rules
       WHERE school_id = ? AND is_active = 1
       ORDER BY priority ASC`,
      [session.schoolId],
    )) as any[];

    // One rule per applies_to scope (first by priority wins if duplicates exist)
    // — kept for back-compat with any caller still reading `rules`.
    const byScope: Record<string, any> = {};
    for (const r of rows) {
      const k = r.applies_to || 'students';
      if (!byScope[k]) byScope[k] = r;
    }

    // One rule per (applies_to, boarding_scope) pair — lets a school hold a
    // boarding-only AND a day-only rule for the same role at once, not just
    // a single generic rule per role. Key: "students:boarding", "students:all", …
    const byScopeAndBoarding: Record<string, any> = {};
    for (const r of rows) {
      const k = `${r.applies_to || 'students'}:${r.boarding_scope || 'all'}`;
      if (!byScopeAndBoarding[k]) byScopeAndBoarding[k] = r;
    }

    // Per-weekday overrides for the surfaced rules (Sat 10:00 etc.).
    let dayOverrides: Record<string, any[]> = {};
    let dayOverridesByKey: Record<string, any[]> = {};
    try {
      await ensureDayOverrideSchema();
      const allSurfaced = { ...byScope, ...byScopeAndBoarding };
      const ids = Object.values(allSurfaced).map((r: any) => Number(r.id)).filter(Boolean);
      if (ids.length) {
        const ovRows = (await query(
          `SELECT rule_id, weekday, arrival_start_time, arrival_end_time,
                  late_threshold_minutes, closing_time
             FROM attendance_rule_day_overrides
            WHERE rule_id IN (${[...new Set(ids)].map(() => '?').join(',')})
            ORDER BY weekday ASC`,
          [...new Set(ids)],
        )) as any[];
        for (const [scope, r] of Object.entries(byScope)) {
          dayOverrides[scope] = ovRows.filter(o => Number(o.rule_id) === Number((r as any).id));
        }
        for (const [key, r] of Object.entries(byScopeAndBoarding)) {
          dayOverridesByKey[key] = ovRows.filter(o => Number(o.rule_id) === Number((r as any).id));
        }
      }
    } catch { /* overrides are optional */ }

    return NextResponse.json({
      success: true,
      rule: rows[0] || null,
      rules: byScope, // { students?, teachers?, all? } — back-compat
      rules_by_key: byScopeAndBoarding, // { "students:all", "students:boarding", "students:day", … }
      day_overrides: dayOverrides,
      day_overrides_by_key: dayOverridesByKey,
    });
  } catch (err: any) {
    console.error('[attendance/settings GET]', err);
    return NextResponse.json({ error: err.message || 'Failed to fetch settings' }, { status: 500 });
  }
}

/**
 * POST /api/attendance/settings
 * Create or update attendance rule for the current school.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // NOTE: this write has no permission check beyond "authenticated in this
  // school" — matches its pre-existing behaviour. A prior audit flagged
  // this as a gap (contrast with school-config/cafe-settings, which DO
  // gate on a specific permission code), and the natural fix is
  // `attendance.manage`. Checked before wiring it in here: 3 of 5 sampled
  // real production schools (12003, 12011, 12020) currently have ZERO role
  // holding attendance.manage — gating on it today would lock every admin
  // at those schools out of saving attendance settings. Closing this gap
  // needs a deliberate role-permission remediation pass first (grant
  // attendance.manage to each school's admin-equivalent role), not a
  // silent add bundled into this change. Left as-is; flagged for follow-up.
  try {
    const body = await req.json();
    const {
      rule_name = 'Default',
      rule_description = '',
      arrival_start_time,
      arrival_end_time,
      late_threshold_minutes = 15,
      absence_cutoff_time,
      closing_time,
      applies_to = 'students',
      applies_to_classes,
      ignore_duplicate_scans_within_minutes = 2,
      weekday_mask = 31, // school days; bits Mon=1,Tue=2,Wed=4,Thu=8,Fri=16,Sat=32,Sun=64
      day_overrides = [], // [{ weekday: 0-6 (Sun-Sat), arrival_end_time?, late_threshold_minutes?, arrival_start_time?, closing_time? }]
      boarding_scope = 'all', // 'all' | 'boarding' | 'day' (Phase 3)
      boarding_presence_mode = 'daily', // 'daily' | 'continuous' (Phase 4, boarding_scope='boarding' rules only)
      boarding_presence_validity_days = null, // null = indefinite until explicit leave
    } = body;
    const wmask = Number.isFinite(Number(weekday_mask))
      ? Math.max(1, Math.min(127, Number(weekday_mask)))
      : 31;

    // Validate time formats (HH:MM or HH:MM:SS)
    const timeRe = /^\d{2}:\d{2}(:\d{2})?$/;
    if (arrival_start_time && !timeRe.test(arrival_start_time)) {
      return NextResponse.json({ error: 'Invalid arrival_start_time format' }, { status: 400 });
    }
    if (arrival_end_time && !timeRe.test(arrival_end_time)) {
      return NextResponse.json({ error: 'Invalid arrival_end_time format' }, { status: 400 });
    }
    if (absence_cutoff_time && !timeRe.test(absence_cutoff_time)) {
      return NextResponse.json({ error: 'Invalid absence_cutoff_time format' }, { status: 400 });
    }
    if (closing_time && !timeRe.test(closing_time)) {
      return NextResponse.json({ error: 'Invalid closing_time format' }, { status: 400 });
    }

    const scope = (['students', 'teachers', 'all'] as const).includes(applies_to)
      ? applies_to
      : 'students';
    const bScope = (['all', 'boarding', 'day'] as const).includes(boarding_scope)
      ? boarding_scope
      : 'all';
    const presenceMode = bScope === 'boarding' && boarding_presence_mode === 'continuous' ? 'continuous' : 'daily';
    const presenceValidityDays = presenceMode === 'continuous' && Number.isFinite(Number(boarding_presence_validity_days)) && Number(boarding_presence_validity_days) > 0
      ? Math.round(Number(boarding_presence_validity_days))
      : null;

    // Replace ONLY the rule for this (scope, boarding_scope) pair, so saving
    // the boarding-only window does not wipe the day-only or generic window
    // for the same role. Role-specific rules (students / teachers) get a
    // lower priority number than 'all' so they override the "everyone"
    // default; boarding_scope precedence is separate — engine.loadActiveRule()
    // always prefers a boarding_scope match over a boarding_scope='all' rule
    // regardless of priority.
    await query(
      `UPDATE attendance_rules SET is_active = 0, updated_at = CURRENT_TIMESTAMP
        WHERE school_id = ? AND is_active = 1 AND applies_to = ? AND boarding_scope = ?`,
      [session.schoolId, scope, bScope],
    );

    const priority = scope === 'all' ? 100 : 50;

    // Insert new rule
    const result: any = await query(
      `INSERT INTO attendance_rules
         (school_id, rule_name, rule_description, arrival_start_time, arrival_end_time,
          late_threshold_minutes, absence_cutoff_time, closing_time, applies_to,
          applies_to_classes, ignore_duplicate_scans_within_minutes, weekday_mask, is_active,
          effective_date, priority, scope_type, boarding_scope,
          boarding_presence_mode, boarding_presence_validity_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, CURDATE(), ?, 'role', ?, ?, ?)`,
      [
        session.schoolId,
        rule_name,
        rule_description || null,
        arrival_start_time || null,
        arrival_end_time || null,
        late_threshold_minutes,
        absence_cutoff_time || null,
        closing_time || null,
        scope,
        applies_to_classes || null,
        ignore_duplicate_scans_within_minutes,
        wmask,
        priority,
        bScope,
        presenceMode,
        presenceValidityDays,
      ],
    );

    // Per-weekday overrides for the new rule (e.g. Saturday arrival 10:00).
    // Validated: weekday 0-6, times HH:MM(:SS); rows with no override
    // fields are skipped (blank day = inherit the base rule).
    const newRuleId = Number(result?.insertId);
    if (newRuleId && Array.isArray(day_overrides)) {
      const clean = day_overrides
        .filter((o: any) => o && Number.isInteger(Number(o.weekday)) && Number(o.weekday) >= 0 && Number(o.weekday) <= 6)
        .map((o: any) => ({
          weekday: Number(o.weekday),
          arrival_start_time: o.arrival_start_time && timeRe.test(o.arrival_start_time) ? o.arrival_start_time : null,
          arrival_end_time: o.arrival_end_time && timeRe.test(o.arrival_end_time) ? o.arrival_end_time : null,
          late_threshold_minutes: Number.isFinite(Number(o.late_threshold_minutes)) && o.late_threshold_minutes !== '' && o.late_threshold_minutes !== null
            ? Math.max(0, Math.min(600, Number(o.late_threshold_minutes)))
            : null,
          closing_time: o.closing_time && timeRe.test(o.closing_time) ? o.closing_time : null,
        }));
      await saveRuleDayOverrides(newRuleId, clean);
    }

    await logAudit({
      schoolId: session.schoolId, userId: session.userId,
      action: AuditAction.SETTINGS_CHANGED, entityType: 'attendance_rules', entityId: newRuleId ?? null,
      details: {
        rule_name, scope, arrival_start_time, arrival_end_time, late_threshold_minutes, closing_time, weekday_mask: wmask,
        boarding_scope: bScope, boarding_presence_mode: presenceMode, boarding_presence_validity_days: presenceValidityDays,
      },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    });

    return NextResponse.json({
      success: true,
      rule_id: result?.insertId,
      message: 'Attendance settings saved',
    });
  } catch (err: any) {
    console.error('[attendance/settings POST]', err);
    return NextResponse.json({ error: err.message || 'Failed to save settings' }, { status: 500 });
  }
}
