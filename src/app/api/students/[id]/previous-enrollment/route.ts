import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getDbMode } from '@/lib/db/db-mode';

/**
 * local-sqlite branch — Phase 7 sub-effort 32, same §25a pattern. Scoped
 * via a students join (enrollments has no school_id column locally — same
 * fact /api/enrollments' own branch documents), with an explicit ownership
 * check first so an unowned student id 404s instead of silently returning
 * someone else's enrollment. class_results is LARGE_EXCLUDED from the
 * lean .drs export (sub-effort 23) — results_summary/top_subjects come
 * back empty here, same as a real student with no results that term.
 */
async function offlineGetPreviousEnrollment(schoolId: number, studentId: string) {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const db = getSqliteDb();

  const owned = db.prepare('SELECT id FROM students WHERE id = ? AND school_id = ?').get(studentId, schoolId);
  if (!owned) return NextResponse.json({ error: 'Student not found' }, { status: 404 });

  const enrollment = db.prepare(`
    SELECT e.id AS enrollment_id, e.student_id, e.academic_year_id, ay.name AS academic_year_name, ay.start_date AS academic_year_start,
      e.term_id, t.name AS term_name, t.start_date AS term_start,
      e.class_id, c.name AS class_name, c.class_level AS class_level,
      e.stream_id, st.name AS stream_name,
      e.study_mode_id, sm.name AS study_mode_name,
      e.curriculum_id, cur.name AS curriculum_name,
      e.program_id, pr.name AS program_name,
      e.enrollment_type, e.status, e.enrollment_date
    FROM enrollments e
    LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
    LEFT JOIN terms t ON e.term_id = t.id
    LEFT JOIN classes c ON e.class_id = c.id
    LEFT JOIN streams st ON e.stream_id = st.id
    LEFT JOIN study_modes sm ON e.study_mode_id = sm.id
    LEFT JOIN curriculums cur ON e.curriculum_id = cur.id
    LEFT JOIN programs pr ON e.program_id = pr.id
    WHERE e.student_id = ?
    ORDER BY ay.start_date DESC, t.start_date DESC, e.id DESC
    LIMIT 1
  `).get(studentId) as Record<string, any> | undefined;

  if (!enrollment) return NextResponse.json({ success: true, data: null });

  enrollment.programs = db.prepare(
    `SELECT pr.id, pr.name FROM enrollment_programs ep JOIN programs pr ON ep.program_id = pr.id WHERE ep.enrollment_id = ?`
  ).all(enrollment.enrollment_id);

  if (enrollment.class_id && enrollment.term_id) {
    enrollment.results_summary = db.prepare(`
      SELECT COUNT(*) AS result_count, ROUND(AVG(score), 1) AS avg_score, MAX(score) AS max_score, MIN(score) AS min_score,
        SUM(CASE WHEN score >= 50 THEN 1 ELSE 0 END) AS passed_count
      FROM class_results WHERE student_id = ? AND class_id = ? AND term_id = ?
    `).get(studentId, enrollment.class_id, enrollment.term_id);
    enrollment.top_subjects = db.prepare(`
      SELECT sub.name AS subject_name, cr.score, cr.grade FROM class_results cr
      JOIN subjects sub ON cr.subject_id = sub.id
      WHERE cr.student_id = ? AND cr.class_id = ? AND cr.term_id = ?
      ORDER BY cr.score DESC LIMIT 5
    `).all(studentId, enrollment.class_id, enrollment.term_id);
  } else {
    enrollment.results_summary = null;
    enrollment.top_subjects = [];
  }

  return NextResponse.json({ success: true, data: enrollment });
}

/**
 * GET /api/students/[id]/previous-enrollment
 *
 * Returns the student's most recent enrollment record, enriched with:
 *  - class, term, academic year, stream
 *  - study mode
 *  - programs
 *  - results summary (count, avg, max, min, passed count)
 *  - top 5 subjects by score
 *
 * Used by the enrollment page to display previous academic context
 * before the teacher makes a Promote / Continue / Demote decision.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session0 = await getSessionSchoolId(req);
  if (!session0) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: studentId0 } = await params;
  if (!studentId0 || !/^\d+$/.test(studentId0)) {
    return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
  }
  if (getDbMode() === 'local-sqlite') {
    return offlineGetPreviousEnrollment(session0.schoolId, studentId0);
  }

  const conn = await getConnection();
  try {
    const session = session0;
    const schoolId = session.schoolId;

    const studentId = studentId0;
    if (!studentId || !/^\d+$/.test(studentId)) {
      return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
    }

    // ── Most recent enrollment ──────────────────────────────────────────────
    const [enrollments]: any = await conn.execute(
      `SELECT
         e.id                        AS enrollment_id,
         e.student_id,
         e.academic_year_id,
         ay.name                     AS academic_year_name,
         ay.start_date               AS academic_year_start,
         e.term_id,
         t.name                      AS term_name,
         t.start_date                AS term_start,
         e.class_id,
         c.name                      AS class_name,
         c.class_level               AS class_level,
         e.stream_id,
         st.name                     AS stream_name,
         e.study_mode_id,
         sm.name                     AS study_mode_name,
         e.curriculum_id,
         cur.name                    AS curriculum_name,
         e.program_id,
         pr.name                     AS program_name,
         e.enrollment_type,
         e.status,
         e.enrollment_date
       FROM enrollments e
       LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
       LEFT JOIN terms t            ON e.term_id          = t.id
       LEFT JOIN classes c          ON e.class_id         = c.id
       LEFT JOIN streams st         ON e.stream_id        = st.id
       LEFT JOIN study_modes sm     ON e.study_mode_id    = sm.id
       LEFT JOIN curriculums cur    ON e.curriculum_id    = cur.id
       LEFT JOIN programs pr        ON e.program_id       = pr.id
       WHERE e.student_id = ? AND e.school_id = ?
       ORDER BY ay.start_date DESC, t.start_date DESC, e.id DESC
       LIMIT 1`,
      [studentId, schoolId]
    );

    if (!(enrollments as any[]).length) {
      return NextResponse.json({ success: true, data: null });
    }

    const enrollment: Record<string, any> = (enrollments as any[])[0];

    // ── Programs for this enrollment ────────────────────────────────────────
    const [programs]: any = await conn.execute(
      `SELECT pr.id, pr.name
       FROM enrollment_programs ep
       JOIN programs pr ON ep.program_id = pr.id
       WHERE ep.enrollment_id = ?`,
      [enrollment.enrollment_id]
    );
    enrollment.programs = programs ?? [];

    // ── Results summary for that class + term ───────────────────────────────
    if (enrollment.class_id && enrollment.term_id) {
      const [summary]: any = await conn.execute(
        `SELECT
           COUNT(*)                                       AS result_count,
           ROUND(AVG(score), 1)                           AS avg_score,
           MAX(score)                                     AS max_score,
           MIN(score)                                     AS min_score,
           SUM(CASE WHEN score >= 50 THEN 1 ELSE 0 END)  AS passed_count
         FROM class_results
         WHERE student_id = ? AND class_id = ? AND term_id = ?`,
        [studentId, enrollment.class_id, enrollment.term_id]
      );
      enrollment.results_summary = (summary as any[])[0] ?? null;

      // Top-5 subjects by score
      const [topSubjects]: any = await conn.execute(
        `SELECT
           sub.name  AS subject_name,
           cr.score,
           cr.grade
         FROM class_results cr
         JOIN subjects sub ON cr.subject_id = sub.id
         WHERE cr.student_id = ? AND cr.class_id = ? AND cr.term_id = ?
         ORDER BY cr.score DESC
         LIMIT 5`,
        [studentId, enrollment.class_id, enrollment.term_id]
      );
      enrollment.top_subjects = topSubjects ?? [];
    } else {
      enrollment.results_summary = null;
      enrollment.top_subjects = [];
    }

    return NextResponse.json({ success: true, data: enrollment });
  } catch (err) {
    console.error('[students/previous-enrollment] error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch previous enrollment' },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}
