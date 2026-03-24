import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * SECURITY: PHASE 2A FIX - Class Results Report
 * GET /api/reports/classresults
 * 
 * Returns class results for authenticated user's school only:
 * - Requires authentication (session.schoolId)
 * - Filters ALL queries by school_id
 * - Prevents cross-school data leakage
 */
export async function GET(req: NextRequest) {
  let connection;
  try {
    // SECURITY: Enforce authentication
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    connection = await getConnection();

    // Fetch school info from database (for current school only)
    let schoolInfo = { name: 'School', address: '' };
    try {
      const [schools]: any = await connection.execute(
        'SELECT name, address FROM schools WHERE id = ? LIMIT 1',
        [schoolId]
      );
      if (schools.length > 0) {
        schoolInfo = { name: schools[0].name || 'School', address: schools[0].address || '' };
      }
    } catch (e) { /* use default */ }

    // SECURITY: Fetch class results ONLY for current school
    const [results]: any = await connection.execute(
      `SELECT 
        students.id AS student_id,
        CONCAT(people.first_name, ' ', people.last_name) AS student_name,
        people.email,
        people.phone,
        students.status,
        branches.name AS branch_name,
        subjects.name AS subject_name,
        class_results.score,
        class_results.grade,
        class_results.remarks
      FROM class_results
      JOIN students ON class_results.student_id = students.id
      JOIN people ON students.person_id = people.id
      LEFT JOIN branches ON students.village_id = branches.id
      JOIN subjects ON class_results.subject_id = subjects.id
      WHERE students.deleted_at IS NULL AND students.school_id = ?
      ORDER BY students.id`,
      [schoolId]  // SECURITY: Filter by school_id
    );

    // Map results to custom type and group by student
    const learners = results.reduce((acc: Record<number, any>, row: any) => {
      const studentId = row.student_id;
      if (!acc[studentId]) {
        acc[studentId] = {
          id: studentId,
          name: row.student_name,
          email: row.email,
          phone: row.phone,
          status: row.status,
          branch_name: row.branch_name,
          grades: [],
        };
      }
      acc[studentId].grades.push({
        subject: row.subject_name,
        score: row.score,
        grade: row.grade,
        remarks: row.remarks,
      });
      return acc;
    }, {});

    return NextResponse.json({
      schoolInfo,
      learners: Object.values(learners),
      labels: {
        name: 'Name',
        email: 'Email',
        phone: 'Phone',
        status: 'Status',
        branch: 'Branch',
        grades: 'Grades',
        subject: 'Subject',
        score: 'Score',
        remarks: 'Remarks',
      },
    });
  } catch (error) {
    console.error('Error fetching class results:', error);
    return NextResponse.json({ error: 'Failed to fetch class results' }, { status: 500 });
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}