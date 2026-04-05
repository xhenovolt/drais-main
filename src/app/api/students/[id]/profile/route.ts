import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/students/[id]/profile
 * Returns full student profile: personal info, parents, documents,
 * additional_info, and enrollment history with programs per enrollment.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const conn = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { id: studentId } = await params;
    if (!studentId || !/^\d+$/.test(studentId)) {
      return NextResponse.json({ error: 'Invalid student id' }, { status: 400 });
    }

    // Core student + person data
    const [students]: any = await conn.execute(
      `SELECT
         s.id AS student_id,
         s.admission_no,
         s.status AS student_status,
         s.admission_date,
         p.id AS person_id,
         p.first_name,
         p.last_name,
         p.other_name,
         p.gender,
         p.date_of_birth,
         p.phone,
         p.email,
         p.photo_url
       FROM students s
       JOIN people p ON s.person_id = p.id
       WHERE s.id = ? AND s.school_id = ?`,
      [studentId, schoolId]
    );

    if (!students.length) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    const student = students[0];

    // Additional info
    const [additionalRows]: any = await conn.execute(
      `SELECT orphan_status, previous_school, notes
       FROM student_additional_info
       WHERE student_id = ?`,
      [studentId]
    );
    const additional = additionalRows[0] ?? null;

    // Parents / guardians
    const [parentRows]: any = await conn.execute(
      `SELECT pa.id AS parent_id, pa.name, pa.phone, pa.email, sp.relationship
       FROM student_parents sp
       JOIN parents pa ON sp.parent_id = pa.id
       WHERE sp.student_id = ?`,
      [studentId]
    );

    // Documents
    const [docRows]: any = await conn.execute(
      `SELECT id, document_type, file_url, uploaded_at
       FROM student_documents
       WHERE student_id = ? AND school_id = ?
       ORDER BY uploaded_at DESC`,
      [studentId, schoolId]
    );

    // Enrollment history
    const [enrollmentRows]: any = await conn.execute(
      `SELECT
         e.id AS enrollment_id,
         e.class_id,
         c.name AS class_name,
         e.stream_id,
         st.name AS stream_name,
         e.academic_year_id,
         ay.name AS academic_year_name,
         e.term_id,
         t.name AS term_name,
         e.study_mode_id,
         sm.name AS study_mode_name,
         e.enrollment_type,
         e.status,
         e.enrollment_date,
         e.end_date,
         e.end_reason
       FROM enrollments e
       LEFT JOIN classes c ON e.class_id = c.id
       LEFT JOIN streams st ON e.stream_id = st.id
       LEFT JOIN academic_years ay ON e.academic_year_id = ay.id
       LEFT JOIN terms t ON e.term_id = t.id
       LEFT JOIN study_modes sm ON e.study_mode_id = sm.id
       WHERE e.student_id = ? AND e.school_id = ?
       ORDER BY e.enrollment_date DESC, e.id DESC`,
      [studentId, schoolId]
    );

    // Programs per enrollment (batch)
    if (enrollmentRows.length > 0) {
      const eids: number[] = enrollmentRows.map((r: any) => r.enrollment_id);
      const placeholders = eids.map(() => '?').join(',');
      const [epRows]: any = await conn.execute(
        `SELECT ep.enrollment_id, pr.id AS program_id, pr.name AS program_name
         FROM enrollment_programs ep
         JOIN programs pr ON ep.program_id = pr.id
         WHERE ep.enrollment_id IN (${placeholders})`,
        eids
      );
      const programMap: Record<number, { id: number; name: string }[]> = {};
      for (const ep of epRows) {
        if (!programMap[ep.enrollment_id]) programMap[ep.enrollment_id] = [];
        programMap[ep.enrollment_id].push({ id: ep.program_id, name: ep.program_name });
      }
      for (const row of enrollmentRows) row.programs = programMap[row.enrollment_id] ?? [];
    }

    return NextResponse.json({
      success: true,
      data: {
        ...student,
        additional,
        parents: parentRows,
        documents: docRows,
        enrollments: enrollmentRows,
      },
    });
  } catch (error) {
    console.error('Error fetching student profile:', error);
    return NextResponse.json({ error: 'Failed to fetch student profile' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
