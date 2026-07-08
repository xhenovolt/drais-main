/**
 * Shift definitions CRUD (shift engine — migration 034).
 *
 * GET    — list this school's shifts (+ assignment counts)
 * POST   { name, code?, applies_to?, start_time, end_time, arrival_window_minutes?,
 *          late_threshold_minutes?, early_leave_threshold_minutes?,
 *          overtime_after_minutes?, weekday_mask?, effective_from?, effective_to? }
 * PATCH  ?id  — update any of the above
 * DELETE ?id  — archive (status='archived') + archive its assignments
 *
 * Reads require attendance.sessions.view, writes attendance.sessions.manage
 * (admins hold these via the attendance.* wildcard — no new RBAC seeding).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

async function guard(req: NextRequest, perm: string) {
  const session = await getSessionSchoolId(req);
  if (!session) return { error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }) };
  try { await requirePermission(session.userId, session.schoolId, perm, session.isSuperAdmin); }
  catch (e) { return { error: NextResponse.json({ error: (e as Error).message }, { status: 403 }) }; }
  return { session };
}

/** end <= start ⇒ the shift wraps past midnight (e.g. 18:00 → 06:00). */
function computeCrossesMidnight(start: string, end: string): number {
  const m = (t: string) => { const [h = '0', mi = '0'] = String(t).split(':'); return (+h || 0) * 60 + (+mi || 0); };
  return m(end) <= m(start) ? 1 : 0;
}

export async function GET(req: NextRequest) {
  const g = await guard(req, 'attendance.sessions.view'); if ('error' in g) return g.error;
  const rows = await query(
    `SELECT sh.id, sh.name, sh.code, sh.applies_to, sh.start_time, sh.end_time,
            sh.arrival_window_minutes, sh.late_threshold_minutes,
            sh.early_leave_threshold_minutes, sh.overtime_after_minutes,
            sh.weekday_mask, sh.crosses_midnight, sh.effective_from, sh.effective_to, sh.status,
            (SELECT COUNT(*) FROM shift_assignments sa
              WHERE sa.shift_id = sh.id AND (sa.status IS NULL OR sa.status='active')) AS assignment_count
       FROM shifts sh
      WHERE sh.school_id = ? AND (sh.status IS NULL OR sh.status <> 'archived')
      ORDER BY sh.start_time ASC, sh.name ASC`,
    [g.session.schoolId],
  );
  return NextResponse.json({ success: true, rows });
}

export async function POST(req: NextRequest) {
  const g = await guard(req, 'attendance.sessions.manage'); if ('error' in g) return g.error;
  const b = await req.json().catch(() => null);
  const name = (b?.name || '').trim();
  if (!name || !b?.start_time || !b?.end_time) {
    return NextResponse.json({ error: 'name, start_time and end_time are required' }, { status: 400 });
  }
  const res: any = await query(
    `INSERT INTO shifts
       (school_id, name, code, applies_to, start_time, end_time, arrival_window_minutes,
        late_threshold_minutes, early_leave_threshold_minutes, overtime_after_minutes,
        weekday_mask, crosses_midnight, effective_from, effective_to, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [
      g.session.schoolId, name, b.code || null, ['staff', 'learner', 'both'].includes(b.applies_to) ? b.applies_to : 'staff',
      b.start_time, b.end_time,
      Number(b.arrival_window_minutes) || 30, Number(b.late_threshold_minutes) || 15,
      Number(b.early_leave_threshold_minutes) || 30,
      b.overtime_after_minutes == null || b.overtime_after_minutes === '' ? null : Number(b.overtime_after_minutes),
      Number.isFinite(Number(b.weekday_mask)) ? Number(b.weekday_mask) : 31,
      computeCrossesMidnight(b.start_time, b.end_time),
      b.effective_from || null, b.effective_to || null, g.session.userId ?? null,
    ],
  );
  return NextResponse.json({ success: true, id: res.insertId }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const g = await guard(req, 'attendance.sessions.manage'); if ('error' in g) return g.error;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const sets: string[] = []; const params: any[] = [];
  const set = (col: string, val: any) => { sets.push(`${col}=?`); params.push(val); };
  if (b.name !== undefined) set('name', (b.name || '').trim());
  if (b.code !== undefined) set('code', b.code || null);
  if (b.applies_to !== undefined && ['staff', 'learner', 'both'].includes(b.applies_to)) set('applies_to', b.applies_to);
  if (b.start_time !== undefined) set('start_time', b.start_time);
  if (b.end_time !== undefined) set('end_time', b.end_time);
  if (b.arrival_window_minutes !== undefined) set('arrival_window_minutes', Number(b.arrival_window_minutes) || 0);
  if (b.late_threshold_minutes !== undefined) set('late_threshold_minutes', Number(b.late_threshold_minutes) || 0);
  if (b.early_leave_threshold_minutes !== undefined) set('early_leave_threshold_minutes', Number(b.early_leave_threshold_minutes) || 0);
  if (b.overtime_after_minutes !== undefined) set('overtime_after_minutes', b.overtime_after_minutes === '' || b.overtime_after_minutes == null ? null : Number(b.overtime_after_minutes));
  if (b.weekday_mask !== undefined) set('weekday_mask', Number(b.weekday_mask) || 0);
  if (b.effective_from !== undefined) set('effective_from', b.effective_from || null);
  if (b.effective_to !== undefined) set('effective_to', b.effective_to || null);
  if (b.status !== undefined) set('status', b.status || 'active');
  // Keep crosses_midnight consistent whenever either time changes.
  if (b.start_time !== undefined || b.end_time !== undefined) {
    const [row]: any = await query(`SELECT start_time, end_time FROM shifts WHERE id=? AND school_id=?`, [id, g.session.schoolId]);
    if (row) set('crosses_midnight', computeCrossesMidnight(b.start_time ?? row.start_time, b.end_time ?? row.end_time));
  }
  if (!sets.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  params.push(id, g.session.schoolId);
  await query(`UPDATE shifts SET ${sets.join(', ')} WHERE id=? AND school_id=?`, params);
  return NextResponse.json({ success: true });
}

export async function DELETE(req: NextRequest) {
  const g = await guard(req, 'attendance.sessions.manage'); if ('error' in g) return g.error;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  await query(`UPDATE shift_assignments SET status='archived' WHERE shift_id=? AND school_id=?`, [id, g.session.schoolId]);
  await query(`UPDATE shifts SET status='archived' WHERE id=? AND school_id=?`, [id, g.session.schoolId]);
  return NextResponse.json({ success: true });
}
