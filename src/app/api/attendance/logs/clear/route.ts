import { NextRequest, NextResponse } from 'next/server';
import { withTransaction } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * POST /api/attendance/logs/clear
 * ───────────────────────────────
 * Clears ALL attendance log data for the CALLER'S school — the raw punch
 * events plus everything derived from them (per-day records + dashboard
 * aggregates). Attendance CONFIGURATION (rules, shifts, holidays,
 * time policy) and the devices themselves are left untouched.
 *
 * Guardrails:
 *   • School-scoped: only ever deletes `WHERE school_id = <session school>`.
 *     A user can never clear another tenant's logs.
 *   • Super-admin only — this is a bulk, irreversible delete.
 *   • Requires an explicit `{ confirm: true }` body so it can't fire by
 *     accident. The UI shows a warning modal before calling this.
 *
 * Body: { confirm: true }
 * Returns: { success, cleared: { raw_events, records, daily_aggregates } }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!session.isSuperAdmin) {
    return NextResponse.json(
      { error: 'Only an administrator can clear attendance logs.' },
      { status: 403 },
    );
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body → not confirmed */ }
  if (body?.confirm !== true) {
    return NextResponse.json(
      { error: 'Confirmation required. Pass { "confirm": true }.' },
      { status: 400 },
    );
  }

  const { schoolId } = session;

  try {
    const cleared = await withTransaction(async (conn) => {
      // Derived tables first, then the source events. All school-scoped.
      const [agg] = await conn.execute(
        'DELETE FROM attendance_daily_aggregates WHERE school_id = ?',
        [schoolId],
      );
      const [rec] = await conn.execute(
        'DELETE FROM attendance_records WHERE school_id = ?',
        [schoolId],
      );
      const [raw] = await conn.execute(
        'DELETE FROM attendance_raw_events WHERE school_id = ?',
        [schoolId],
      );
      return {
        daily_aggregates: (agg as any).affectedRows ?? 0,
        records: (rec as any).affectedRows ?? 0,
        raw_events: (raw as any).affectedRows ?? 0,
      };
    });

    console.log(
      `[Attendance Clear] school=${schoolId} by user=${session.userId} (${session.email}) — ` +
      `raw_events=${cleared.raw_events} records=${cleared.records} aggregates=${cleared.daily_aggregates}`,
    );

    const total = cleared.raw_events + cleared.records + cleared.daily_aggregates;
    return NextResponse.json({
      success: true,
      cleared,
      message: total > 0
        ? `Cleared ${cleared.raw_events.toLocaleString()} attendance log${cleared.raw_events === 1 ? '' : 's'}.`
        : 'No attendance logs to clear.',
    });
  } catch (err: any) {
    console.error('[Attendance Clear] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to clear attendance logs', details: err?.message },
      { status: 500 },
    );
  }
}
