import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/students/[id]/timeline
 *
 * Returns the complete academic timeline for a learner:
 *   year / term / class / results per term, ordered chronologically.
 *
 * Multi-tenant: school_id is derived exclusively from the session —
 * a student can only be queried by their own school's authenticated user.
 *
 * Response format:
 * {
 *   student: { id, admission_no, first_name, last_name, current_class },
 *   timeline: [
 *     {
 *       year: "2025",
 *       term: "Term 2",
 *       class: "PRIMARY SEVEN",
 *       results: [
 *         { subject: "MATHEMATICS", score: 86, grade: "D2" },
 *         ...
 *       ]
 *     },
 *     ...
 *   ]
 * }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  let connection;

  try {
    // ── Auth & tenant isolation ──────────────────────────────
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId as number;

    const studentId = parseInt(params.id, 10);
    if (!Number.isFinite(studentId) || studentId <= 0) {
      return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
    }

    connection = await getConnection();

    // ── Verify student belongs to this school ─────────────────
    const [studentRows]: any[] = await connection.query(
      `SELECT s.id, s.admission_no, p.first_name, p.last_name, c.name AS current_class
       FROM students s
       JOIN people     p ON s.person_id = p.id
       LEFT JOIN classes c ON s.class_id  = c.id
       WHERE s.id = ? AND s.school_id = ?
       LIMIT 1`,
      [studentId, schoolId]
    );

    if (!studentRows || studentRows.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    const student = studentRows[0];

    // ── Pull all enrollment rows for this student ─────────────
    //    One row per (year, term, class) — results are aggregated per term.
    const [enrollRows]: any[] = await connection.query(
      `SELECT
         ay.name  AS year,
         t.name   AS term,
         c.name   AS class,
         t.id     AS term_id,
         c.id     AS class_id,
         e.id     AS enrollment_id
       FROM enrollments e
       JOIN terms         t  ON e.term_id          = t.id
       JOIN academic_years ay ON t.academic_year_id = ay.id
       JOIN classes        c  ON e.class_id         = c.id
       WHERE e.student_id = ? AND e.school_id = ?
       ORDER BY ay.name ASC, t.name ASC`,
      [studentId, schoolId]
    );

    // ── Pull all results for this student (via exams) ─────────
    const [resultRows]: any[] = await connection.query(
      `SELECT
         sub.name  AS subject,
         r.score,
         r.grade,
         ex.term_id,
         ex.class_id
       FROM results r
       JOIN exams    ex  ON r.exam_id     = ex.id
       JOIN subjects sub ON ex.subject_id = sub.id
       WHERE r.student_id = ? AND ex.school_id = ?
       ORDER BY sub.name ASC`,
      [studentId, schoolId]
    );

    // Index results by term_id+class_id tuple
    const resultIndex = new Map<string, typeof resultRows>();
    for (const row of resultRows) {
      const key = `${row.term_id}_${row.class_id}`;
      if (!resultIndex.has(key)) resultIndex.set(key, []);
      resultIndex.get(key)!.push({
        subject: row.subject,
        score: Number(row.score),
        grade: row.grade,
      });
    }

    // ── Deduplicate enrollments (year+term+class) ─────────────
    const seen = new Set<string>();
    const timeline: object[] = [];

    for (const row of enrollRows) {
      const dedupeKey = `${row.year}_${row.term}_${row.class_id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      const entryResults = resultIndex.get(`${row.term_id}_${row.class_id}`) || [];

      timeline.push({
        year: row.year,
        term: row.term,
        class: row.class,
        results: entryResults,
        result_count: entryResults.length,
      });
    }

    return NextResponse.json({
      student: {
        id: student.id,
        admission_no: student.admission_no,
        first_name: student.first_name,
        last_name: student.last_name,
        current_class: student.current_class,
      },
      timeline,
    });

  } catch (err: any) {
    console.error('[/api/students/[id]/timeline] Error:', err?.message);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      try { await (connection as any).end?.(); } catch {}
    }
  }
}
