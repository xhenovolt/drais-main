import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getDbMode } from '@/lib/db/db-mode';

export const runtime = 'nodejs';

/**
 * local-sqlite branch — Phase 7 sub-effort 39, same §25a pattern. This
 * entire feature is read from `attendance_records`, LARGE_EXCLUDED from
 * the lean export (sub-effort 23) — always empty offline, same fact every
 * attendance-reading page in this phase already lives with. Returns the
 * real empty shape (zero counts, empty lists) rather than a 500, so the
 * dashboard widget renders its own "nothing yet" state instead of a
 * failed fetch.
 */
function offlineInsights(days: number, since: string) {
  const emptyDist = { present: 0, late: 0, absent: 0 };
  const emptyRole = { distribution: emptyDist, mostAbsent: [], mostLate: [], bestPresent: [], people: 0, schoolDaysCounted: 0 };
  return NextResponse.json({
    success: true,
    days,
    since,
    staff: emptyRole,
    learners: { ...emptyRole, byResidence: { day: { ...emptyDist }, boarding: { ...emptyDist } } },
  });
}

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

  if (getDbMode() === 'local-sqlite') {
    return offlineInsights(days, since);
  }

  interface PersonAgg {
    person_id: number; name: string; detail: string | null; residence: string | null;
    absents: number; lates: number; presents: number; days: number;
  }

  const emptyDist = () => ({ present: 0, late: 0, absent: 0 });

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
      : `LEFT JOIN students s_res ON s_res.person_id = r.person_id AND s_res.school_id = r.school_id`;
    const detailCol = role === 'staff'
      ? 'MAX(st.position)'
      : `MAX((SELECT c3.name FROM students s3
                JOIN enrollments e3 ON e3.student_id = s3.id AND e3.status = 'active'
                LEFT JOIN programs pr3 ON pr3.id = e3.program_id
                JOIN classes c3 ON c3.id = e3.class_id
               WHERE s3.person_id = r.person_id AND s3.school_id = r.school_id
               ORDER BY pr3.is_default DESC, e3.id DESC LIMIT 1))`;
    // Residence (day/boarding) — students only. Reported separately below so
    // a school can see "is this absence total mostly boarders who simply
    // hadn't reported yet this period, or day scholars actually missing
    // school" instead of one undifferentiated number.
    const residenceCol = role === 'student' ? `MAX(COALESCE(NULLIF(s_res.residency_status, ''), 'day'))` : `NULL`;
    const rows = (await query(
      `SELECT r.person_id,
              TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name,
              ${detailCol} AS detail,
              ${residenceCol} AS residence,
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
      residence: r.residence === 'boarding' ? 'boarding' as const : r.residence === 'day' ? 'day' as const : null,
      absents: num(r.absents), lates: num(r.lates), presents: num(r.presents), days: num(r.days),
    }));

    const addDist = (a: { present: number; late: number; absent: number }, p: typeof people[number]) =>
      ({ present: a.present + p.presents - p.lates, late: a.late + p.lates, absent: a.absent + p.absents });
    const distribution = people.reduce(addDist, emptyDist());
    // Person-DAY totals over the window, split by residence — these are not
    // headcounts (a chronically-absent boarder contributes many "absent"
    // days, one person), which is exactly why the split matters: a school
    // needs to tell "many boarders who simply hadn't reported yet this
    // period" apart from "day scholars genuinely missing school".
    const byResidence = role === 'student'
      ? {
          day: people.filter(p => p.residence === 'day').reduce(addDist, emptyDist()),
          boarding: people.filter(p => p.residence === 'boarding').reduce(addDist, emptyDist()),
        }
      : undefined;
    const top = (key: 'absents' | 'lates', n = 5) =>
      [...people].filter(p => p[key] > 0).sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name)).slice(0, n);
    const best = [...people]
      .filter(p => p.presents > 0)
      .sort((a, b) => b.presents - a.presents || a.lates - b.lates || a.name.localeCompare(b.name))
      .slice(0, 5);

    // Distinct school-days actually counted in the window — a school onboarded
    // recently may only have a handful, and the dashboard says so explicitly
    // rather than let a big cumulative total read as if it spans years.
    const schoolDaysRows = (await query(
      `SELECT COUNT(DISTINCT attendance_date) n FROM attendance_records
        WHERE school_id = ? AND role_type = ? AND attendance_date >= ? AND status IN ('present', 'late', 'absent')`,
      [schoolId, role, since],
    )) as Array<{ n: number }>;
    const schoolDaysCounted = num(schoolDaysRows[0]?.n);

    return { distribution, byResidence, mostAbsent: top('absents'), mostLate: top('lates'), bestPresent: best, people: people.length, schoolDaysCounted };
  };

  try {
    const [staff, learners] = await Promise.all([perRole('staff'), perRole('student')]);
    return NextResponse.json({ success: true, days, since, staff, learners });
  } catch (err: any) {
    console.error('[attendance/insights]', err);
    return NextResponse.json({ error: err?.message || 'Failed to load insights' }, { status: 500 });
  }
}
