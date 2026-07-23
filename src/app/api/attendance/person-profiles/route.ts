/**
 * GET /api/attendance/person-profiles?role=staff|student&days=30
 *   → per-person behavioural profiles, watch-list first.
 * GET ?person_id=&role=&days=  → one person's profile + day series.
 * GET ?banner=1&role=  → watch-list count (cheap inline poll).
 *
 * Understands the INDIVIDUAL: reliable / occasionally-late / chronically-late
 * / frequently-absent / declining, from materialised daily verdicts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { profilePerson, type PersonDay } from '@/lib/attendance/person-intelligence';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;
  const sp = new URL(req.url).searchParams;
  const role = sp.get('role') === 'student' ? 'student' : 'staff';
  const days = Math.min(120, Math.max(14, parseInt(sp.get('days') || '30', 10) || 30));
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  try {
    // Single person.
    if (sp.get('person_id')) {
      const pid = Number(sp.get('person_id'));
      const rows = (await query(
        `SELECT attendance_date AS date, status FROM attendance_records
          WHERE school_id = ? AND person_id = ? AND role_type = ? AND attendance_date >= ?
          ORDER BY attendance_date ASC`,
        [schoolId, pid, role, since],
      )) as PersonDay[];
      return NextResponse.json({ success: true, person_id: pid, profile: profilePerson(rows), series: rows });
    }

    // All people with recent records, grouped.
    const rows = (await query(
      `SELECT r.person_id,
              TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name,
              r.attendance_date AS date, r.status
         FROM attendance_records r
         JOIN people p ON p.id = r.person_id
        WHERE r.school_id = ? AND r.role_type = ? AND r.attendance_date >= ?
        ORDER BY r.person_id, r.attendance_date ASC`,
      [schoolId, role, since],
    )) as Array<{ person_id: number; name: string; date: string; status: string }>;

    const byPerson = new Map<number, { name: string; days: PersonDay[] }>();
    for (const r of rows) {
      if (!byPerson.has(r.person_id)) byPerson.set(r.person_id, { name: r.name, days: [] });
      byPerson.get(r.person_id)!.days.push({ date: String(r.date).slice(0, 10), status: r.status });
    }

    const profiles = [...byPerson.entries()].map(([person_id, v]) => ({
      person_id, name: v.name, ...profilePerson(v.days),
    }));

    // Watch-list first, then by absence rate.
    const order: Record<string, number> = { frequently_absent: 0, declining: 1, chronically_late: 2, occasionally_late: 3, improving: 4, reliable: 5, insufficient_data: 6 };
    profiles.sort((a, b) => (order[a.behaviour] - order[b.behaviour]) || (b.absentRate - a.absentRate));

    if (sp.get('banner')) {
      return NextResponse.json({ success: true, watch: profiles.filter(p => p.watch).length });
    }
    return NextResponse.json({
      success: true, role, days,
      watchlist: profiles.filter(p => p.watch),
      all: profiles,
      summary: {
        people: profiles.length,
        frequently_absent: profiles.filter(p => p.behaviour === 'frequently_absent').length,
        declining: profiles.filter(p => p.behaviour === 'declining').length,
        chronically_late: profiles.filter(p => p.behaviour === 'chronically_late').length,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
