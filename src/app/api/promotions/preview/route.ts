import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * PROMOTIONS PREVIEW API
 * Endpoint: /api/promotions/preview
 * Method: POST
 * 
 * Purpose: Preview which students qualify for promotion based on Term 3 results and criteria
 * Returns: List of eligible and ineligible students with their scores
 * 
 * Usage:
 * POST /api/promotions/preview
 * Body: {
 *   school_id: 1,
 *   academic_year_id: 1,
 *   from_class_id: 1,
 *   to_class_id: 2,
 *   minimum_total_marks: 250,
 *   minimum_average_marks: 50
 * }
 */

export async function POST(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { academic_year_id,
      from_class_id,
      to_class_id,
      minimum_total_marks,
      minimum_average_marks,
      minimum_subjects_passed,
      attendance_percentage = 75 } = body;

    if (!academic_year_id || !from_class_id || !to_class_id) {
      return NextResponse.json(
        { error: 'Missing required fields: academic_year_id, from_class_id, to_class_id' },
        { status: 400 }
      );
    }

    connection = await getConnection();

    // Get all students in the class for this academic year
    const [allStudents] = await connection.execute(
      `SELECT 
        s.id,
        s.admission_no,
        p.first_name,
        p.last_name,
        c.name as from_class_name,
        c2.name as to_class_name,
        COALESCE(SUM(r.total_marks), 0) as total_marks,
        COALESCE(AVG(r.total_marks), 0) as average_marks,
        COUNT(DISTINCT r.subject_id) as subjects_passed,
        COALESCE(
          (SELECT ROUND(COUNT(CASE WHEN status = 'present' OR status = 'late' THEN 1 END) / COUNT(*) * 100, 2)
           FROM student_attendance 
           WHERE student_id = s.id AND MONTH(date) >= 10 AND MONTH(date) <= 12),
          100
        ) as attendance_percentage
      FROM students s
      JOIN people p ON s.person_id = p.id
      JOIN enrollments e ON s.id = e.student_id
      JOIN classes c ON e.class_id = c.id
      JOIN classes c2 ON ? = c2.id
      LEFT JOIN results r ON s.id = r.student_id 
        AND r.academic_year_id = ?
        AND r.term_id IN (SELECT id FROM terms WHERE academic_year_id = ? AND name = 'Term 3')
      WHERE 
        s.school_id = ?
        AND e.academic_year_id = ?
        AND c.id = ?
        AND s.deleted_at IS NULL
        AND s.status = 'active'
      GROUP BY s.id, p.id, c.id, c2.id`,
      [to_class_id, academic_year_id, academic_year_id, schoolId, academic_year_id, from_class_id]
    );

    // Separate eligible and ineligible students
    const eligible: any[] = [];
    const ineligible: any[] = [];

    for (const student of allStudents as any[]) {
      const meetsMarks = !minimum_total_marks || student.total_marks >= minimum_total_marks;
      const meetsAverage = !minimum_average_marks || student.average_marks >= minimum_average_marks;
      const meetsSubjects = !minimum_subjects_passed || student.subjects_passed >= minimum_subjects_passed;
      const meetsAttendance = student.attendance_percentage >= attendance_percentage;

      const qualifies = meetsMarks && meetsAverage && meetsSubjects && meetsAttendance;

      const studentData = {
        id: student.id,
        admission_no: student.admission_no,
        name: `${student.first_name} ${student.last_name || ''}`.trim(),
        current_class: student.from_class_name,
        destination_class: student.to_class_name,
        total_marks: parseFloat(student.total_marks),
        average_marks: parseFloat(student.average_marks),
        subjects_passed: student.subjects_passed,
        attendance_percentage: parseFloat(student.attendance_percentage),
        meets_total_marks: meetsMarks,
        meets_average_marks: meetsAverage,
        meets_subjects_passed: meetsSubjects,
        meets_attendance: meetsAttendance
      };

      if (qualifies) {
        eligible.push(studentData);
      } else {
        ineligible.push(studentData);
      }
    }

    await connection.end();

    return NextResponse.json({
      success: true,
      preview: {
        academic_year_id,
        from_class_id,
        to_class_id,
        criteria: {
          minimum_total_marks,
          minimum_average_marks,
          minimum_subjects_passed,
          attendance_percentage
        },
        summary: {
          total_students: (allStudents as any[]).length,
          eligible_count: eligible.length,
          ineligible_count: ineligible.length,
          promotion_percentage: ((eligible.length / (allStudents as any[]).length) * 100).toFixed(1)
        },
        eligible_students: eligible,
        ineligible_students: ineligible
      }
    });
  } catch (error) {
    console.error('Error generating promotion preview:', error);
    if (connection) await connection.end();
    return NextResponse.json(
      { error: 'Failed to generate promotion preview', details: (error as any).message },
      { status: 500 }
    );
  }
}
