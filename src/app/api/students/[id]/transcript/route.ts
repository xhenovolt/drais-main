/**
 * GET /api/students/[id]/transcript
 *
 * Phase L5 — cumulative academic transcript data for one learner.
 *
 * Returns every mark a learner has ever earned, grouped by year ->
 * term -> subject. Computes per-subject cumulative average + final
 * grade across all terms, plus a school-wide overall mean. No live
 * snapshot dependency — pulls directly from `class_results` so the
 * transcript reflects current authoritative data, not a frozen
 * point-in-time view.
 *
 * The /print-transcript/[id] page consumes this shape directly; the
 * PDF endpoint puppeteers that page.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { fetchSchool } from '@/lib/snapshots/queries';

interface StudentRow {
  id: number; admission_no: string | null; gender: string | null;
  first_name: string; last_name: string; other_name: string | null;
  photo_url: string | null; date_of_birth: string | null;
  class_name: string | null; stream_name: string | null;
}
interface ResultRow {
  result_id:     number;
  score:         number | null;
  grade:         string | null;
  remarks:       string | null;
  subject_id:    number;
  subject_name:  string;
  subject_code:  string | null;
  term_id:       number | null;
  term_name:     string | null;
  year_id:       number | null;
  year_name:     string | null;
  year_start:    string | null;
}

/**
 * Letter grade from numeric score using a Cambridge-leaning bucket.
 * Same scale as the snapshot grader default (PHASE 1A) but inlined
 * so the transcript stays decoupled from the snapshot module.
 */
function gradeFor(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return '-';
  if (score >= 80) return 'A';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  if (score >= 40) return 'E';
  return 'F';
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const studentId = Number((await params).id);
  if (!studentId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });

  // 1. Student + current enrolment context
  const studentRows = (await query(
    `SELECT s.id, s.admission_no, p.first_name, p.last_name, p.other_name,
            p.gender, p.date_of_birth, p.photo_url,
            c.name  AS class_name,
            st.name AS stream_name
       FROM students s
       JOIN people p ON p.id = s.person_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       LEFT JOIN classes c  ON c.id  = e.class_id
       LEFT JOIN streams st ON st.id = e.stream_id
      WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL
      LIMIT 1`,
    [studentId, session.schoolId],
  )) as StudentRow[];
  if (studentRows.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const stu = studentRows[0];

  // 2. School branding
  const school = await fetchSchool(session.schoolId);

  // 3. All marks, joined for grouping. NOT filtered by result_type so
  //    every recorded score in the student's history is folded in.
  const rows = (await query(
    `SELECT cr.id AS result_id, cr.score, cr.grade, cr.remarks,
            sub.id AS subject_id, sub.name AS subject_name, sub.code AS subject_code,
            t.id   AS term_id, t.name AS term_name,
            ay.id  AS year_id,  ay.name AS year_name, ay.start_date AS year_start
       FROM class_results cr
       JOIN subjects sub ON sub.id = cr.subject_id
       LEFT JOIN terms          t  ON t.id  = cr.term_id
       LEFT JOIN academic_years ay ON ay.id = t.academic_year_id
      WHERE cr.student_id = ?
        AND sub.school_id = ?
      ORDER BY ay.start_date ASC, t.term_number ASC, sub.name ASC`,
    [studentId, session.schoolId],
  )) as ResultRow[];

  // 4. Group into year -> term -> subjects. Maintain insertion order from
  //    the ORDER BY so the UI doesn't need to re-sort.
  const yearMap = new Map<string, { yearId: number | null; yearName: string; terms: Map<string, { termId: number | null; termName: string; subjects: Array<{ subjectId: number; subjectName: string; subjectCode: string | null; score: number | null; grade: string }> }> }>();
  const subjectAccum = new Map<number, { subjectId: number; subjectName: string; subjectCode: string | null; scores: number[] }>();

  for (const r of rows) {
    const yearKey = String(r.year_id ?? `null-${r.year_name ?? '—'}`);
    const termKey = String(r.term_id ?? `null-${r.term_name ?? '—'}`);
    if (!yearMap.has(yearKey)) {
      yearMap.set(yearKey, { yearId: r.year_id, yearName: r.year_name ?? '—', terms: new Map() });
    }
    const y = yearMap.get(yearKey)!;
    if (!y.terms.has(termKey)) {
      y.terms.set(termKey, { termId: r.term_id, termName: r.term_name ?? '—', subjects: [] });
    }
    const t = y.terms.get(termKey)!;
    t.subjects.push({
      subjectId:   r.subject_id,
      subjectName: r.subject_name,
      subjectCode: r.subject_code,
      score:       r.score == null ? null : Number(r.score),
      grade:       r.grade && r.grade.trim() ? r.grade : gradeFor(r.score == null ? null : Number(r.score)),
    });

    if (!subjectAccum.has(r.subject_id)) {
      subjectAccum.set(r.subject_id, {
        subjectId: r.subject_id, subjectName: r.subject_name, subjectCode: r.subject_code, scores: [],
      });
    }
    if (r.score != null && Number.isFinite(Number(r.score))) {
      subjectAccum.get(r.subject_id)!.scores.push(Number(r.score));
    }
  }

  const years = Array.from(yearMap.values()).map(y => ({
    yearId:   y.yearId,
    yearName: y.yearName,
    terms:    Array.from(y.terms.values()),
  }));

  const cumulative = Array.from(subjectAccum.values()).map(s => {
    const avg = s.scores.length > 0
      ? s.scores.reduce((a, b) => a + b, 0) / s.scores.length
      : null;
    return {
      subjectId:   s.subjectId,
      subjectName: s.subjectName,
      subjectCode: s.subjectCode,
      attempts:    s.scores.length,
      average:     avg == null ? null : Math.round(avg * 10) / 10,
      grade:       gradeFor(avg),
    };
  });

  const allScores: number[] = [];
  for (const v of subjectAccum.values()) allScores.push(...v.scores);
  const overallMean = allScores.length > 0
    ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10
    : null;

  return NextResponse.json({
    student: {
      id:           stu.id,
      fullName:     [stu.first_name, stu.other_name, stu.last_name].filter(Boolean).join(' '),
      firstName:    stu.first_name,
      lastName:     stu.last_name,
      otherName:    stu.other_name,
      admissionNo:  stu.admission_no,
      gender:       stu.gender,
      dateOfBirth:  stu.date_of_birth,
      photoUrl:     stu.photo_url,
      currentClass: stu.class_name,
      currentStream: stu.stream_name,
    },
    school: school ? {
      name:           school.schoolName,
      legalName:      school.legalName,
      address:        school.address,
      phone:          school.phone,
      email:          school.email,
      logoUrl:        school.logoUrl,
      centerNo:       school.centerNo,
      registrationNo: school.registrationNumber,
    } : null,
    years,
    cumulative,
    overall: {
      mean:           overallMean,
      totalResults:   allScores.length,
      subjectsTouched: subjectAccum.size,
    },
    generatedAt: new Date().toISOString(),
  });
}
