/**
 * POST /api/attendance/logs/delete — delete SPECIFIC attendance punches.
 *
 * Body: { ids: number[], confirm: true }   (max 500 per call)
 *
 * Counterpart to /api/attendance/logs/clear (nuke-everything): this is the
 * surgical version behind the per-row checkboxes on /attendance/logs.
 *
 *   • Administrator only — deleting attendance is destructive.
 *   • Tenancy-scoped: only rows belonging to the caller's school.
 *   • Derived consistency: every affected (person, role, day) is
 *     re-evaluated after the delete so attendance_records / day rollups
 *     don't keep counting a punch that no longer exists.
 *   • Audited: one attendance_audit-style log line with ids + operator.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { evaluateDay } from '@/lib/attendance/engine';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.isSuperAdmin) {
    return NextResponse.json({ error: 'Only an administrator can delete attendance logs.' }, { status: 403 });
  }

  let body: any = {};
  try { body = await req.json(); } catch { /* fallthrough */ }
  if (body?.confirm !== true) {
    return NextResponse.json({ error: 'Pass confirm: true to delete logs.' }, { status: 400 });
  }
  const ids: number[] = Array.isArray(body?.ids)
    ? body.ids.map((n: unknown) => parseInt(String(n), 10)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];
  if (!ids.length) return NextResponse.json({ error: 'ids[] is required' }, { status: 400 });
  if (ids.length > 500) return NextResponse.json({ error: 'Max 500 logs per delete' }, { status: 400 });

  const placeholders = ids.map(() => '?').join(',');

  // Snapshot the rows first — for the audit trail and the re-evaluation set.
  const rows = (await query(
    `SELECT id, person_id, role_type, punch_at, device_sn, device_user_id
       FROM attendance_raw_events
      WHERE school_id = ? AND id IN (${placeholders})`,
    [session.schoolId, ...ids],
  )) as Array<{ id: number; person_id: number | null; role_type: 'student' | 'staff' | null; punch_at: Date | string; device_sn: string | null; device_user_id: number | string | null }>;

  if (!rows.length) return NextResponse.json({ error: 'No matching logs in this school' }, { status: 404 });

  const del = (await query(
    `DELETE FROM attendance_raw_events
      WHERE school_id = ? AND id IN (${placeholders})`,
    [session.schoolId, ...ids],
  )) as { affectedRows?: number };
  const deleted = del?.affectedRows ?? 0;

  // Re-evaluate every affected (person, role, day) so derived attendance
  // no longer reflects the deleted punches. Best-effort per pair.
  const pairs = new Map<string, { personId: number; roleType: 'student' | 'staff'; day: Date }>();
  for (const r of rows) {
    if (!r.person_id || (r.role_type !== 'student' && r.role_type !== 'staff')) continue;
    const punchAt = r.punch_at instanceof Date ? r.punch_at : new Date(r.punch_at);
    const day = new Date(punchAt); day.setHours(0, 0, 0, 0);
    pairs.set(`${r.person_id}|${r.role_type}|${day.toISOString().slice(0, 10)}`, {
      personId: r.person_id, roleType: r.role_type, day,
    });
  }
  let reevaluated = 0;
  for (const p of pairs.values()) {
    try { await evaluateDay(session.schoolId, p.personId, p.roleType, p.day); reevaluated++; }
    catch { /* re-runnable later */ }
  }

  console.log(JSON.stringify({
    ts: new Date().toISOString(), type: 'ATTENDANCE_LOG_DELETE',
    schoolId: session.schoolId, operator: session.userId,
    deleted, reevaluatedDays: reevaluated,
    ids: rows.map(r => r.id),
  }));

  return NextResponse.json({ success: true, deleted, reevaluatedDays: reevaluated });
}
