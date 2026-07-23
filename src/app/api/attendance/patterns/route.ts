/**
 * GET /api/attendance/patterns?days=30&role=student|staff
 * Attendance Pattern Analytics (Phase 6): daily series + trend + anomaly
 * alerts + per-class/department drift, from engine verdicts. Read-only.
 * ?banner=1 → alert count only (cheap inline poll).
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { analyzeSeries, analyzeGroups, trend, type DayPoint } from '@/lib/attendance/pattern-analytics';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;
  const sp = new URL(req.url).searchParams;
  const days = Math.min(120, Math.max(7, parseInt(sp.get('days') || '30', 10) || 30));
  const role = sp.get('role') === 'staff' ? 'staff' : 'student';
  const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

  const list = (sql: string, params: any[] = [schoolId, role, since]) =>
    query(sql, params).catch(() => []) as Promise<any[]>;

  try {
    // Daily verdict series (school-local dates already stored on records).
    const dayRows = (await list(
      `SELECT attendance_date AS date,
              SUM(status IN ('present','late')) AS present_incl_late,
              SUM(status = 'late') AS late,
              SUM(status = 'absent') AS absent,
              COUNT(*) AS total
         FROM attendance_records
        WHERE school_id = ? AND role_type = ? AND attendance_date >= ?
          AND status IN ('present','late','absent','half_day')
        GROUP BY attendance_date ORDER BY attendance_date ASC`,
    )) as any[];

    const series: DayPoint[] = dayRows.map(r => {
      const present = Number(r.present_incl_late) - Number(r.late); // strictly on-time
      return {
        date: String(r.date).slice(0, 10),
        present: Math.max(0, present), late: Number(r.late), absent: Number(r.absent),
        total: Number(r.total),
      };
    });

    const presentRates = series.map(d => (d.total ? (d.present + d.late) / d.total : 0));
    const seriesAlerts = analyzeSeries(series);

    // Per-group drift (only for learners → classes; staff → departments).
    let groupAlerts: any[] = [];
    if (role === 'student') {
      const cls = (await list(
        `SELECT c.name AS name,
                SUM(r.status = 'present') AS present, SUM(r.status = 'late') AS late,
                SUM(r.status = 'absent') AS absent, COUNT(*) AS total
           FROM attendance_records r
           JOIN students s ON s.id IN (SELECT id FROM students WHERE person_id = r.person_id AND school_id = r.school_id)
           JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
           JOIN classes c ON c.id = e.class_id
          WHERE r.school_id = ? AND r.role_type = 'student' AND r.attendance_date >= ?
          GROUP BY c.id, c.name`,
        [schoolId, since],
      )) as any[];
      groupAlerts = analyzeGroups(cls.map(g => ({ name: g.name, present: Number(g.present), late: Number(g.late), absent: Number(g.absent), total: Number(g.total) })), 'class');
    } else {
      const dep = (await list(
        `SELECT COALESCE(d.name, st.position, 'Unassigned') AS name,
                SUM(r.status = 'present') AS present, SUM(r.status = 'late') AS late,
                SUM(r.status = 'absent') AS absent, COUNT(*) AS total
           FROM attendance_records r
           JOIN staff st ON st.person_id = r.person_id AND st.school_id = r.school_id AND st.deleted_at IS NULL
           LEFT JOIN departments d ON d.id = st.department_id
          WHERE r.school_id = ? AND r.role_type = 'staff' AND r.attendance_date >= ?
          GROUP BY name`,
        [schoolId, since],
      )) as any[];
      groupAlerts = analyzeGroups(dep.map(g => ({ name: g.name, present: Number(g.present), late: Number(g.late), absent: Number(g.absent), total: Number(g.total) })), 'department');
    }

    const alerts = [...seriesAlerts, ...groupAlerts];
    if (sp.get('banner')) {
      const worst = alerts.filter(a => a.level === 'alert')[0] || null;
      return NextResponse.json({ success: true, alert: worst, alerts: alerts.filter(a => a.level === 'alert').length });
    }

    return NextResponse.json({
      success: true, days, role, since,
      series,
      trend: trend(presentRates),
      alerts,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Analytics failed' }, { status: 500 });
  }
}
