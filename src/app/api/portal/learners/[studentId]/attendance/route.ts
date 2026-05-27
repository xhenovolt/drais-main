/**
 * GET /api/portal/learners/[studentId]/attendance?days=60
 * Gated attendance history + summary for a parent's linked learner.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLinkedLearner } from '@/lib/portal/context';
import { query } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ studentId: string }> }) {
  const studentId = Number((await params).studentId);
  if (!studentId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  const res = await requireLinkedLearner(req, studentId);
  if ('error' in res) return res.error;
  const { schoolId } = res.ctx;

  const days = Math.min(180, Math.max(7, parseInt(new URL(req.url).searchParams.get('days') ?? '60', 10) || 60));

  const [summary, recent] = await Promise.all([
    query(
      `SELECT COUNT(*) AS total,
              SUM(status IN ('present','late')) AS present,
              SUM(status = 'absent') AS absent,
              SUM(status = 'late')   AS late,
              SUM(status = 'excused') AS excused
         FROM daily_attendance
        WHERE school_id = ? AND person_type = 'student' AND person_id = ?
          AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [schoolId, studentId, days],
    ) as Promise<any[]>,
    query(
      `SELECT attendance_date, status, first_arrival_time, late_minutes
         FROM daily_attendance
        WHERE school_id = ? AND person_type = 'student' AND person_id = ?
          AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        ORDER BY attendance_date DESC LIMIT 60`,
      [schoolId, studentId, days],
    ) as Promise<any[]>,
  ]);

  const s = summary[0] ?? {};
  const total = Number(s.total ?? 0);
  const present = Number(s.present ?? 0);

  return NextResponse.json({
    success: true,
    window_days: days,
    summary: {
      total, present, absent: Number(s.absent ?? 0), late: Number(s.late ?? 0), excused: Number(s.excused ?? 0),
      rate: total > 0 ? Math.round((present / total) * 1000) / 10 : null,
    },
    days: recent.map(r => ({
      date: r.attendance_date, status: r.status,
      arrival: r.first_arrival_time, late_minutes: r.late_minutes,
    })),
  });
}
