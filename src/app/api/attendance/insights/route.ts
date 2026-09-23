import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/insights?days=30
 *
 * Attendance intelligence for the dashboard, per role (staff / learners),
 * over the last N school-local days — read from attendance_records, the
 * engine's verdict store (single source of attendance truth):
 *
 *   distribution  present / late / absent day-verdict totals
 *   mostAbsent    top 5 people by absent days
 *   mostLate      top 5 people by late days
 *   bestPresent   top 5 people by present days (least absent, tie → least late)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;

  const daysRaw = parseInt(new URL(req.url).searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysRaw) ? Math.min(365, Math.max(7, daysRaw)) : 30;
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  interface PersonAgg {
    person_id: number; name: string; detail: string | null;
    absents: number; lates: number; presents: number; days: number;
  }

  const perRole = async (role: 'staff' | 'student') => {
    // A student may hold 2+ simultaneous active enrollments (multi-program).
    // A JOIN over every match would double-count the SUM()/COUNT() aggregates
    // below (computed BEFORE the GROUP BY collapses the duplicate rows), so
    // absents/lates/presents/days would inflate 2x for those students. A
    // scalar correlated subquery avoids both that AND the JOIN-with-
    // subquery-in-ON TiDB rejects — it picks one deterministic "primary"
    // enrollment per row without joining anything.
    const detailJoin = role === 'staff'
      ? `LEFT JOIN staff st ON st.person_id = r.person_id AND st.school_id = r.school_id AND st.deleted_at IS NULL`
      : '';
    const detailCol = role === 'staff'
      ? 'MAX(st.position)'
      : `MAX((SELECT c3.name FROM students s3
                JOIN enrollments e3 ON e3.student_id = s3.id AND e3.status = 'active'
                LEFT JOIN programs pr3 ON pr3.id = e3.program_id
                JOIN classes c3 ON c3.id = e3.class_id
               WHERE s3.person_id = r.person_id AND s3.school_id = r.school_id
               ORDER BY pr3.is_default DESC, e3.id DESC LIMIT 1))`;
    const rows = (await query(
      `SELECT r.person_id,
              TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name,
              ${detailCol} AS detail,
              SUM(r.status = 'absent') AS absents,
              SUM(r.status = 'late') AS lates,
              SUM(r.status IN ('present', 'late')) AS presents,
              COUNT(*) AS days
         FROM attendance_records r
         JOIN people p ON p.id = r.person_id
         ${detailJoin}
        WHERE r.school_id = ? AND r.role_type = ? AND r.attendance_date >= ?
          AND r.status IN ('present', 'late', 'absent')
        GROUP BY r.person_id, name`,
      [schoolId, role, since],
    )) as unknown as PersonAgg[];

    const num = (v: unknown) => Number(v || 0);
    const people = rows.map(r => ({
      personId: Number(r.person_id), name: r.name, detail: r.detail,
      absents: num(r.absents), lates: num(r.lates), presents: num(r.presents), days: num(r.days),
    }));

    const distribution = people.reduce(
      (a, p) => ({ present: a.present + p.presents - p.lates, late: a.late + p.lates, absent: a.absent + p.absents }),
      { present: 0, late: 0, absent: 0 },
    );
    const top = (key: 'absents' | 'lates', n = 5) =>
      [...people].filter(p => p[key] > 0).sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name)).slice(0, n);
    const best = [...people]
      .filter(p => p.presents > 0)
      .sort((a, b) => b.presents - a.presents || a.lates - b.lates || a.name.localeCompare(b.name))
      .slice(0, 5);

    return { distribution, mostAbsent: top('absents'), mostLate: top('lates'), bestPresent: best, people: people.length };
  };

  try {
    const [staff, learners] = await Promise.all([perRole('staff'), perRole('student')]);
    return NextResponse.json({ success: true, days, since, staff, learners });
  } catch (err: any) {
    console.error('[attendance/insights]', err);
    return NextResponse.json({ error: err?.message || 'Failed to load insights' }, { status: 500 });
  }
}
