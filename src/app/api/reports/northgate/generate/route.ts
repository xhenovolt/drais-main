import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import type { NorthgateReportData, SubjectRow, GradingRow } from '@/components/reports/types';

// ============================================================================
// GET /api/reports/northgate/generate
//
// Generates live NorthgateReportData for one student from TiDB.
//
// Query params:
//   student_id   (required)
//   term_id      (optional — latest results used if omitted)
//   class_id     (optional — derived from enrollment if omitted)
//
// Security: session.schoolId is used exclusively — never trusts URL params
//            for school scoping.
// ============================================================================

const NORTHGATE_SCHOOL_ID = 6;

const GRADE_POINTS: Record<string, number> = {
  D1: 1, D2: 2, C3: 3, C4: 4, C5: 5, C6: 6, P7: 7, P8: 8, F9: 9,
};

function gradeToPoints(grade: string | null): number {
  if (!grade) return 9;
  return GRADE_POINTS[grade.toUpperCase().trim()] ?? 9;
}

function aggregatesToDivision(aggs: number, subjectCount: number): string {
  if (subjectCount === 0) return '-';
  if (aggs <= 12) return 'I';
  if (aggs <= 23) return 'II';
  if (aggs <= 29) return 'III';
  if (aggs <= 34) return 'IV';
  return 'U';
}

const DEFAULT_GRADING_SCALE: GradingRow[] = [
  { grade: 'D1', range: '90-100' },
  { grade: 'D2', range: '80-89' },
  { grade: 'C3', range: '70-79' },
  { grade: 'C4', range: '60-69' },
  { grade: 'C5', range: '55-59' },
  { grade: 'C6', range: '50-54' },
  { grade: 'P7', range: '45-49' },
  { grade: 'P8', range: '40-44' },
  { grade: 'F9', range: '0-39' },
];

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Only Northgate staff can generate Northgate report cards
  if (session.schoolId !== NORTHGATE_SCHOOL_ID) {
    return NextResponse.json({ error: 'Forbidden: not a Northgate staff account' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const studentId = Number(searchParams.get('student_id'));
  const termId    = searchParams.get('term_id')  ? Number(searchParams.get('term_id'))  : null;
  const classId   = searchParams.get('class_id') ? Number(searchParams.get('class_id')) : null;

  if (!studentId || isNaN(studentId)) {
    return NextResponse.json({ error: 'student_id is required' }, { status: 400 });
  }

  let conn: any;
  try {
    conn = await getConnection();

    // ── 1. Student + school info ──────────────────────────────────────────────
    const [studentRows]: any = await conn.execute(
      `SELECT s.id, s.admission_no,
              p.first_name, p.last_name, p.gender, p.photo_url,
              sc.name       AS school_name,
              COALESCE(sc.address, '')  AS school_address,
              COALESCE(sc.location, sc.city, '') AS school_location,
              COALESCE(sc.motto, '')   AS school_motto,
              COALESCE(sc.phone, sc.contact_phone, '') AS school_phone
       FROM students s
       JOIN people  p  ON p.id = s.person_id
       JOIN schools sc ON sc.id = s.school_id
       WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL
       LIMIT 1`,
      [studentId, NORTHGATE_SCHOOL_ID],
    );

    if (!studentRows.length) {
      return NextResponse.json({ error: 'Student not found or does not belong to Northgate' }, { status: 404 });
    }
    const student = studentRows[0];

    // ── 2. Enrollment → class, stream, term ──────────────────────────────────
    const enrollParams: any[] = [studentId];
    let enrollFilter = '';
    if (termId) { enrollFilter = 'AND e.term_id = ?'; enrollParams.push(termId); }
    else if (classId) { enrollFilter = 'AND e.class_id = ?'; enrollParams.push(classId); }

    const [enrollRows]: any = await conn.execute(
      `SELECT e.class_id, e.term_id, e.stream_id,
              c.name  AS class_name,
              COALESCE(st.name, '')  AS stream_name,
              COALESCE(t.name,  '')  AS term_name,
              COALESCE(ay.name, ay2.name, '') AS academic_year_name
       FROM enrollments e
       JOIN   classes c  ON c.id = e.class_id
       LEFT JOIN streams   st  ON st.id  = e.stream_id
       LEFT JOIN terms     t   ON t.id   = e.term_id
       LEFT JOIN academic_years ay  ON ay.id  = e.academic_year_id
       LEFT JOIN academic_years ay2 ON ay2.id = t.academic_year_id
       WHERE e.student_id = ? ${enrollFilter}
         AND e.deleted_at IS NULL
       ORDER BY e.id DESC
       LIMIT 1`,
      enrollParams,
    );

    const enroll   = enrollRows[0] ?? null;
    const resolvedClassId = enroll?.class_id ?? classId;
    const resolvedTermId  = enroll?.term_id  ?? termId;

    // ── 3. Class results ──────────────────────────────────────────────────────
    const resultParams: any[] = [studentId];
    let resultFilter = '';
    if (resolvedClassId) { resultFilter += ' AND cr.class_id = ?'; resultParams.push(resolvedClassId); }
    if (resolvedTermId)  { resultFilter += ' AND cr.term_id  = ?'; resultParams.push(resolvedTermId);  }

    const [resultRows]: any = await conn.execute(
      `SELECT cr.score, cr.grade, cr.remarks,
              sub.name         AS subject_name,
              COALESCE(sub.subject_type, 'secular') AS subject_type
       FROM class_results cr
       JOIN subjects sub ON sub.id = cr.subject_id
       WHERE cr.student_id = ? ${resultFilter}
       ORDER BY sub.subject_type, sub.name ASC`,
      resultParams,
    );

    // Split: secular (or null) → principal; theology → other
    const principalSubjects: SubjectRow[] = [];
    const otherSubjects: SubjectRow[]     = [];

    for (const r of resultRows) {
      const row: SubjectRow = {
        name:     r.subject_name,
        eot:      r.score   != null ? Number(r.score)   : null,
        total:    r.score   != null ? Number(r.score)   : null,
        grade:    r.grade   ?? null,
        comment:  r.remarks ?? null,
        initials: null,
      };
      if (r.subject_type === 'theology') {
        otherSubjects.push(row);
      } else {
        principalSubjects.push(row);
      }
    }

    // ── 4. Totals + aggregates ────────────────────────────────────────────────
    const principalWithScore = principalSubjects.filter(s => s.eot != null);
    const totalMarks   = principalWithScore.reduce((sum, s) => sum + (s.eot ?? 0), 0) || null;
    const averageMarks = principalWithScore.length
      ? Math.round(totalMarks! / principalWithScore.length)
      : null;

    const aggregates = principalSubjects.reduce(
      (sum, s) => sum + gradeToPoints(s.grade),
      0,
    ) || null;
    const division = aggregates != null
      ? aggregatesToDivision(aggregates, principalSubjects.length)
      : null;

    // ── 5. Class position ─────────────────────────────────────────────────────
    let classPosition = '-';
    let streamPosition = '-';

    if (resolvedClassId && resolvedTermId && totalMarks != null) {
      try {
        const [posRows]: any = await conn.execute(
          `SELECT
             (SELECT COUNT(DISTINCT cr2.student_id) + 1
              FROM class_results cr2
              JOIN students s2 ON s2.id = cr2.student_id AND s2.school_id = ? AND s2.deleted_at IS NULL
              WHERE cr2.class_id = ? AND cr2.term_id = ?
                AND (SELECT COALESCE(SUM(cr3.score), 0) FROM class_results cr3
                     WHERE cr3.student_id = cr2.student_id
                       AND cr3.class_id = ? AND cr3.term_id = ?)
                    > ?
             ) AS class_pos,
             (SELECT COUNT(DISTINCT cr4.student_id)
              FROM class_results cr4
              JOIN students s4 ON s4.id = cr4.student_id AND s4.school_id = ? AND s4.deleted_at IS NULL
              WHERE cr4.class_id = ? AND cr4.term_id = ?
             ) AS total_in_class`,
          [
            NORTHGATE_SCHOOL_ID, resolvedClassId, resolvedTermId,
            resolvedClassId, resolvedTermId, totalMarks,
            NORTHGATE_SCHOOL_ID, resolvedClassId, resolvedTermId,
          ],
        );
        if (posRows.length) {
          const total = posRows[0].total_in_class ?? '?';
          classPosition  = `${posRows[0].class_pos ?? '?'} / ${total}`;
          streamPosition = classPosition; // same unless stream-level data exists
        }
      } catch {
        // position calculation is best-effort
      }
    }

    // ── 6. Report card comments (graceful fallback if table missing) ──────────
    let comments = { classTeacher: null as string | null, dos: null as string | null, headTeacher: null as string | null };
    try {
      const commentParams: any[] = [studentId];
      let commentFilter = '';
      if (resolvedClassId) { commentFilter += ' AND class_id = ?'; commentParams.push(resolvedClassId); }
      if (resolvedTermId)  { commentFilter += ' AND term_id = ?';  commentParams.push(resolvedTermId);  }

      const [commentRows]: any = await conn.execute(
        `SELECT class_teacher_comment, dos_comment, headteacher_comment
         FROM report_card_comments
         WHERE student_id = ? ${commentFilter}
         ORDER BY id DESC LIMIT 1`,
        commentParams,
      );
      if (commentRows.length) {
        comments = {
          classTeacher: commentRows[0].class_teacher_comment ?? null,
          dos:          commentRows[0].dos_comment           ?? null,
          headTeacher:  commentRows[0].headteacher_comment   ?? null,
        };
      }
    } catch {
      // Table may not exist yet — silently return null comments
    }

    // ── 7. Next term begin date ───────────────────────────────────────────────
    let nextTermDate: string | null = null;
    if (resolvedTermId) {
      try {
        const [nextRows]: any = await conn.execute(
          `SELECT start_date FROM terms
           WHERE start_date > (SELECT start_date FROM terms WHERE id = ? LIMIT 1)
           ORDER BY start_date ASC LIMIT 1`,
          [resolvedTermId],
        );
        if (nextRows.length && nextRows[0].start_date) {
          const d = new Date(nextRows[0].start_date);
          nextTermDate = `...... ${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ......`;
        }
      } catch {
        // best-effort
      }
    }

    // ── 8. Assemble ───────────────────────────────────────────────────────────
    const data: NorthgateReportData = {
      school: {
        name:     student.school_name    || 'NORTHGATE SCHOOL',
        address:  student.school_address || 'P.O.Box 47 IGANGA',
        location: student.school_location|| 'Bulubandi Central B',
        motto:    student.school_motto   || 'IMPACT THROUGH EDUCATION',
        phone:    student.school_phone   || '0706416264',
      },
      banner: `${enroll?.term_name ?? ''} REPORT`.trim() || 'TERM REPORT',
      studentDetails: {
        name:      `${student.first_name} ${student.last_name}`.toUpperCase(),
        sex:       (student.gender?.charAt(0)?.toUpperCase() ?? 'M') as 'M' | 'F',
        studentNo: student.admission_no ?? String(studentId),
        class:     enroll?.class_name   ?? '',
        term:      enroll?.term_name    ? `${enroll.term_name}${enroll.academic_year_name ? '-' + enroll.academic_year_name : ''}` : '',
        photoUrl:  student.photo_url    ?? null,
      },
      principalSubjects,
      otherSubjects,
      assessment: {
        aggregates,
        division,
        classPosition,
        streamPosition,
      },
      comments,
      nextTermDate,
      gradingScale: DEFAULT_GRADING_SCALE,
      totalMarks:   totalMarks ?? null,
      averageMarks: averageMarks ?? null,
    };

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[northgate/generate]', error);
    return NextResponse.json({ error: 'Failed to generate report', details: process.env.NODE_ENV === 'development' ? error.message : undefined }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}
