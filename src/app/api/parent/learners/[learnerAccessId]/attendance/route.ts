/**
 * GET /api/parent/learners/[learnerAccessId]/attendance?days=60
 * Gated by learnerAccessId. Reads canonical attendance_records (corrected time),
 * joining person_id -> students.person_id and filtering by the resolved student.
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLearnerAccess } from '@/lib/parent/context';
import { query } from '@/lib/db';

export async function GET(req: NextRequest, { params }: { params: Promise<{ learnerAccessId: string }> }) {
  const { learnerAccessId } = await params;
  const res = await requireLearnerAccess(req, learnerAccessId);
  if ('error' in res) return res.error;
  const { student_id, school_id } = res.access;

  const days = Math.min(180, Math.max(7, parseInt(new URL(req.url).searchParams.get('days') ?? '60', 10) || 60));

  const [summary, recent] = await Promise.all([
    query(
      `SELECT COUNT(*) AS total,
              SUM(ar.status IN ('present','late')) AS present,
              SUM(ar.status = 'absent') AS absent,
              SUM(ar.status = 'late')   AS late,
              SUM(ar.status IN ('half_day','early_leave')) AS partial
         FROM attendance_records ar
         JOIN students s ON s.person_id = ar.person_id AND s.school_id = ar.school_id
        WHERE ar.school_id = ? AND ar.role_type = 'student' AND s.id = ?
          AND ar.status NOT IN ('weekend','holiday')
          AND ar.attendance_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)`,
      [school_id, student_id, days],
    ) as Promise<any[]>,
    query(
      `SELECT ar.attendance_date, ar.status, ar.first_in_at AS first_arrival_time,
              ar.last_out_at AS last_out_time, ar.late_minutes
         FROM attendance_records ar
         JOIN students s ON s.person_id = ar.person_id AND s.school_id = ar.school_id
        WHERE ar.school_id = ? AND ar.role_type = 'student' AND s.id = ?
          AND ar.attendance_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
        ORDER BY ar.attendance_date DESC LIMIT 60`,
      [school_id, student_id, days],
    ) as Promise<any[]>,
  ]);

  const s = summary[0] ?? {};
  const total = Number(s.total ?? 0);
  const present = Number(s.present ?? 0);

  return NextResponse.json({
    success: true,
    window_days: days,
    summary: {
      total, present, absent: Number(s.absent ?? 0), late: Number(s.late ?? 0), partial: Number(s.partial ?? 0),
      rate: total > 0 ? Math.round((present / total) * 1000) / 10 : null,
    },
    days: recent.map(r => ({
      date: r.attendance_date, status: r.status,
      arrival: r.first_arrival_time, departure: r.last_out_time, late_minutes: r.late_minutes,
    })),
  });
}
