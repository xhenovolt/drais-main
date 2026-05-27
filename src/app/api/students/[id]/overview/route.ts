/**
 * GET /api/students/[id]/overview
 *
 * Operational snapshot for the Learner Command Center: performance average,
 * attendance rate, fee position, active subjects, and a recent-activity
 * timeline — in ONE call.
 *
 * Tenant isolation: the student is first verified to belong to the session's
 * school; all sub-metrics are then student-scoped. Every metric is wrapped in
 * safe() so a schema variation in one area (finance columns drift across
 * deployments) degrades that metric to null instead of failing the whole call.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}
const num = (v: any): number | null => (v == null ? null : Number(v));

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const studentId = Number((await params).id);
  if (!studentId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // Tenant gate: confirm the learner belongs to this school before anything else.
  const owner = (await query(
    `SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [studentId, session.schoolId],
  )) as any[];
  if (!owner.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const schoolId = session.schoolId;

  const [perf, recentResults, attendance, fees, subjects, recentPayments] = await Promise.all([
    // Performance — average score across all graded results (school-scoped via exams).
    safe(query(
      `SELECT AVG(r.score) AS avg_score, COUNT(*) AS graded
         FROM results r
         JOIN exams e ON e.id = r.exam_id AND e.school_id = ?
        WHERE r.student_id = ? AND r.score IS NOT NULL`,
      [schoolId, studentId],
    ) as Promise<any[]>, [{ avg_score: null, graded: 0 }]),

    // Latest few graded results for the trend + recent activity.
    safe(query(
      `SELECT r.score, r.grade, e.name AS exam_name, e.term_id, e.created_at
         FROM results r
         JOIN exams e ON e.id = r.exam_id AND e.school_id = ?
        WHERE r.student_id = ? AND r.score IS NOT NULL
        ORDER BY e.created_at DESC LIMIT 8`,
      [schoolId, studentId],
    ) as Promise<any[]>, []),

    // Attendance rate over the last 120 days (present + late counted present).
    safe(query(
      `SELECT
         COUNT(*) AS total,
         SUM(status IN ('present','late')) AS present,
         SUM(status = 'absent')  AS absent,
         SUM(status = 'late')    AS late
       FROM daily_attendance
       WHERE school_id = ? AND person_type = 'student' AND person_id = ?
         AND attendance_date >= DATE_SUB(CURDATE(), INTERVAL 120 DAY)`,
      [schoolId, studentId],
    ) as Promise<any[]>, [{ total: 0, present: 0, absent: 0, late: 0 }]),

    // Fee position — expected from fee structures, paid from payments. Best-effort.
    safe(query(
      `SELECT
         (SELECT COALESCE(SUM(fs.amount),0)
            FROM student_fee_items sfi
            JOIN fee_structures fs ON fs.id = sfi.fee_structure_id
           WHERE sfi.student_id = ?) AS expected,
         (SELECT COALESCE(SUM(fp.amount),0)
            FROM fee_payments fp
           WHERE fp.student_id = ?) AS paid`,
      [studentId, studentId],
    ) as Promise<any[]>, [{ expected: null, paid: null }]),

    // Active subjects via the learner's active enrollment class.
    safe(query(
      `SELECT COUNT(DISTINCT cs.subject_id) AS subject_count
         FROM enrollments en
         JOIN class_subjects cs ON cs.class_id = en.class_id
        WHERE en.student_id = ? AND en.school_id = ? AND en.status = 'active'`,
      [studentId, schoolId],
    ) as Promise<any[]>, [{ subject_count: 0 }]),

    // Recent payments for the activity timeline.
    safe(query(
      `SELECT amount, created_at FROM fee_payments
        WHERE student_id = ? ORDER BY created_at DESC LIMIT 5`,
      [studentId],
    ) as Promise<any[]>, []),
  ]);

  const att = attendance[0] ?? {};
  const total = Number(att.total ?? 0);
  const present = Number(att.present ?? 0);
  const expected = num(fees[0]?.expected);
  const paid = num(fees[0]?.paid);
  const balance = expected != null && paid != null ? expected - paid : null;

  // Build a unified recent-activity timeline (results + payments).
  const timeline = [
    ...recentResults.map((r: any) => ({
      type: 'result', label: `${r.exam_name}: ${r.score}${r.grade ? ` (${r.grade})` : ''}`,
      at: r.created_at,
    })),
    ...recentPayments.map((p: any) => ({
      type: 'payment', label: `Payment received: ${Number(p.amount).toLocaleString()}`,
      at: p.created_at,
    })),
  ].filter(e => e.at)
   .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
   .slice(0, 10);

  return NextResponse.json({
    success: true,
    overview: {
      performance: {
        average:    perf[0]?.avg_score == null ? null : Math.round(Number(perf[0].avg_score) * 10) / 10,
        graded_count: Number(perf[0]?.graded ?? 0),
        trend: recentResults
          .slice()
          .reverse()
          .map((r: any) => ({ label: r.exam_name, score: Number(r.score) })),
      },
      attendance: {
        rate:    total > 0 ? Math.round((present / total) * 1000) / 10 : null,
        total_days: total,
        present, absent: Number(att.absent ?? 0), late: Number(att.late ?? 0),
        window_days: 120,
      },
      fees: { expected, paid, balance },
      subjects: { active: Number(subjects[0]?.subject_count ?? 0) },
      timeline,
    },
  });
}
