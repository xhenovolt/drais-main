import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getCurrentTerm } from '@/lib/terms';

/**
 * POST /api/students/bulk/enroll
 * 
 * Bulk enroll multiple students into the current term.
 * 
 * Request:
 * {
 *   "student_ids": [1, 2, 3],
 *   "class_id": 5 (optional - if provided, enroll all to same class),
 *   "stream_id": 10 (optional)
 * }
 * 
 * Security:
 * - Requires authentication
 * - All students must belong to the school
 * - Uses current term by default
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    const { student_ids, class_id, stream_id } = await req.json();

    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return NextResponse.json(
        { error: 'Invalid student_ids' },
        { status: 400 }
      );
    }

    // Get current term
    const currentTerm = await getCurrentTerm(schoolId);
    if (!currentTerm) {
      return NextResponse.json(
        { error: 'No active term configured' },
        { status: 404 }
      );
    }

    // Verify all students belong to school
    const [verification]: any = await conn.execute(
      `SELECT COUNT(*) as cnt FROM students WHERE school_id = ? AND id IN (${student_ids.map(() => '?').join(',')})`,
      [schoolId, ...student_ids]
    );

    if (verification[0].cnt !== student_ids.length) {
      return NextResponse.json(
        { error: 'Some students do not belong to your school' },
        { status: 403 }
      );
    }

    // For each student, get their current class and enroll them in current term
    let enrolled = 0;
    let failed = 0;

    for (const studentId of student_ids) {
      try {
        // Get student's current class
        const [studentData]: any = await conn.execute(
          `SELECT e.class_id, e.stream_id FROM enrollments e 
           WHERE e.student_id = ? AND e.school_id = ? AND e.status = 'active'
           ORDER BY e.academic_year_id DESC LIMIT 1`,
          [studentId, schoolId]
        );

        const enrollClassId = class_id || (studentData[0]?.class_id);
        const enrollStreamId = stream_id || (studentData[0]?.stream_id);

        if (!enrollClassId) {
          failed++;
          continue;
        }

        // Create enrollment
        await conn.execute(
          `INSERT INTO enrollments 
           (school_id, student_id, class_id, stream_id, academic_year_id, term_id, status, enrollment_date)
           VALUES (?, ?, ?, ?, ?, ?, 'active', NOW())`,
          [schoolId, studentId, enrollClassId, enrollStreamId, currentTerm.academicYearId, currentTerm.termId]
        );

        enrolled++;
      } catch (error) {
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Enrolled ${enrolled} students in ${currentTerm.termName}`,
      enrolled,
      failed,
      academic_year: currentTerm.academicYearName,
      term: currentTerm.termName
    });
  } catch (error) {
    console.error('Bulk enroll error:', error);
    return NextResponse.json(
      { error: 'Failed to process bulk enroll' },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}
