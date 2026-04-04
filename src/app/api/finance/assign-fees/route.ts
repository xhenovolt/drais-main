import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { assignFeesToStudent } from '@/lib/services/FinanceLedger';

// POST /api/finance/assign-fees
//
// Modes:
//   single:  { student_id, class_id, program_ids?, term_id? }
//   bulk:    { class_id, term_id? }   → assigns to ALL enrolled students in class

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json();
  const { student_id, class_id, term_id, program_ids } = body;

  if (!class_id) return NextResponse.json({ error: 'class_id is required' }, { status: 400 });

  // ── Single student ──────────────────────────────────────────────────────
  if (student_id) {
    try {
      const result = await assignFeesToStudent({
        studentId: +student_id,
        schoolId: session.schoolId,
        classId: +class_id,
        programIds: Array.isArray(program_ids) ? program_ids.map(Number) : [],
        termId: term_id ? +term_id : undefined,
        createdBy: session.userId,
      });
      return NextResponse.json({
        ok: true,
        message: `${result.assigned} fee(s) assigned, ${result.skipped} already existed`,
        ...result,
      });
    } catch (err: any) {
      return NextResponse.json({ error: err.message }, { status: 500 });
    }
  }

  // ── Bulk: all students enrolled in a class ──────────────────────────────
  const conn = await getConnection();
  try {
    const [students]: any[] = await conn.execute(
      `SELECT DISTINCT e.student_id,
              GROUP_CONCAT(ep.program_id) AS prog_ids
       FROM enrollments e
       LEFT JOIN enrollment_programs ep ON e.id = ep.enrollment_id
       WHERE e.class_id = ? AND e.status = 'active'
       GROUP BY e.student_id`,
      [+class_id]
    );

    let totalAssigned = 0;
    let totalSkipped = 0;
    const studentResults: any[] = [];

    for (const s of students as any[]) {
      const progIds = s.prog_ids
        ? String(s.prog_ids).split(',').map(Number).filter(Boolean)
        : [];

      const r = await assignFeesToStudent({
        studentId: s.student_id,
        schoolId: session.schoolId,
        classId: +class_id,
        programIds: progIds,
        termId: term_id ? +term_id : undefined,
        createdBy: session.userId,
      });
      totalAssigned += r.assigned;
      totalSkipped += r.skipped;
      studentResults.push({ student_id: s.student_id, ...r });
    }

    return NextResponse.json({
      ok: true,
      message: `Processed ${students.length} students — ${totalAssigned} fees assigned, ${totalSkipped} already existed`,
      students_processed: students.length,
      total_assigned: totalAssigned,
      total_skipped: totalSkipped,
      results: studentResults,
    });
  } finally {
    await conn.end();
  }
}
