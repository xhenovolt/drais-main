import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('class_id');
    const termId = searchParams.get('term_id');
    const subjectId = searchParams.get('subject_id');
    const resultTypeId = searchParams.get('result_type_id');

    if (!classId || !subjectId || !resultTypeId) {
      return NextResponse.json({ success: false, error: 'Missing required parameters.' }, { status: 400 });
    }

    const connection = await getConnection();

    // Check if class_results table has any data
    const [resultsCountRows]: any = await connection.execute('SELECT COUNT(*) AS total FROM class_results');
    const resultsCount = resultsCountRows[0]?.total || 0;

    let students: any[] = [];

    if (resultsCount === 0) {
      // No results at all: fetch all students in the class, order by name
      // Note: We don't filter by e.term_id here since enrollments may not have term_id set
      const [rows]: any = await connection.execute(
        `SELECT e.*, s.id as student_id, p.first_name, p.last_name
         FROM enrollments e
         JOIN students s ON s.id = e.student_id
         JOIN people p ON p.id = s.person_id
         WHERE e.class_id = ? AND e.status = 'active'
         ORDER BY p.last_name ASC, p.first_name ASC`,
        [classId]
      );
      students = rows;
    } else {
      // Results exist: fetch students in class who do NOT have a result for the selected subject, type, and term
      // The key fix: we check class_results.term_id against the requested termId, not e.term_id
      let query = `
        SELECT e.*, s.id as student_id, p.first_name, p.last_name
        FROM enrollments e
        JOIN students s ON s.id = e.student_id
        JOIN people p ON p.id = s.person_id
        LEFT JOIN class_results r
          ON r.student_id = s.id
          AND r.class_id = e.class_id
          AND r.subject_id = ?
          AND r.result_type_id = ?`;
      
      let params = [subjectId, resultTypeId];
      
      // Add term condition to the JOIN if termId is provided
      if (termId) {
        query += ` AND r.term_id = ?`;
        params.push(termId);
      } else {
        // If no term specified, we want to exclude students who have ANY result for this subject/type
        query += ` AND r.term_id IS NULL`;
      }
      
      query += `
        WHERE e.class_id = ? AND e.status = 'active'
          AND r.student_id IS NULL
        ORDER BY p.last_name ASC, p.first_name ASC`;
      
      params.push(classId);

      const [rows]: any = await connection.execute(query, params);
      students = rows;
    }

    await connection.end();

    return NextResponse.json({ success: true, data: students });
  } catch (error) {
    console.error('Error fetching missing results:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch missing results' }, { status: 500 });
  }
}
