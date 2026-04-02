import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('class_id');
    const termId = searchParams.get('term_id');
    const subjectId = searchParams.get('subject_id');
    const resultTypeId = searchParams.get('result_type_id');

    if (!classId || !subjectId || !resultTypeId) {
      return NextResponse.json({ success: false, error: 'Missing required parameters.' }, { status: 400 });
    }

    connection = await getConnection();

    // Verify class belongs to this school
    const [classCheck]: any = await connection.execute(
      'SELECT id FROM classes WHERE id = ? AND school_id = ?',
      [classId, schoolId]
    );
    if (!classCheck || classCheck.length === 0) {
      return NextResponse.json({ success: false, error: 'Class not found or access denied' }, { status: 403 });
    }

    // Check if class_results table has any data for this class
    const [resultsCountRows]: any = await connection.execute(
      'SELECT COUNT(*) AS total FROM class_results WHERE class_id = ?',
      [classId]
    );
    const resultsCount = resultsCountRows[0]?.total || 0;

    let students: any[] = [];

    if (resultsCount === 0) {
      // No results yet: fetch all active students in the class
      const [rows]: any = await connection.execute(
        `SELECT e.id as enrollment_id, e.student_id, e.class_id, e.term_id,
                p.first_name, p.last_name, s.admission_no
         FROM enrollments e
         JOIN students s ON s.id = e.student_id
         JOIN people p ON p.id = s.person_id
         WHERE e.class_id = ? AND e.status = 'active' AND s.school_id = ?
         ORDER BY p.first_name ASC, p.last_name ASC`,
        [classId, schoolId]
      );
      students = rows;
    } else {
      // Fetch students who do NOT have a result for the selected subject/type/term
      let query = `
        SELECT e.id as enrollment_id, e.student_id, e.class_id, e.term_id,
               p.first_name, p.last_name, s.admission_no
        FROM enrollments e
        JOIN students s ON s.id = e.student_id
        JOIN people p ON p.id = s.person_id
        LEFT JOIN class_results r
          ON r.student_id = s.id
          AND r.class_id = e.class_id
          AND r.subject_id = ?
          AND r.result_type_id = ?`;

      const params: any[] = [subjectId, resultTypeId];

      if (termId) {
        query += ` AND r.term_id = ?`;
        params.push(termId);
      } else {
        query += ` AND r.term_id IS NULL`;
      }

      query += `
        WHERE e.class_id = ? AND e.status = 'active' AND s.school_id = ?
          AND r.student_id IS NULL
        ORDER BY p.first_name ASC, p.last_name ASC`;

      params.push(classId, schoolId);

      const [rows]: any = await connection.execute(query, params);
      students = rows;
    }

    return NextResponse.json({ success: true, data: students });
  } catch (error) {
    console.error('Error fetching missing results:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch missing results' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
