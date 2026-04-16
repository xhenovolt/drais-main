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
    const subjectId = searchParams.get('subject_id');
    const resultTypeId = searchParams.get('result_type_id');
    const termId = searchParams.get('term_id');
    const subjectType = searchParams.get('subject_type');
    const academicType = searchParams.get('academic_type');
    const query = searchParams.get('query') || '';

    connection = await getConnection();

    // Always filter by school_id for tenant isolation
    let where = 'WHERE s.school_id = ?';
    const params: any[] = [schoolId];

    if (classId) {
      where += ' AND cr.class_id = ?';
      params.push(classId);
    }
    if (subjectId) {
      where += ' AND cr.subject_id = ?';
      params.push(subjectId);
    }
    if (resultTypeId) {
      where += ' AND cr.result_type_id = ?';
      params.push(resultTypeId);
    }
    if (termId) {
      where += ' AND cr.term_id = ?';
      params.push(termId);
    }
    if (subjectType) {
      where += ' AND sub.subject_type = ?';
      params.push(subjectType);
    }
    if (academicType && ['secular', 'theology'].includes(academicType)) {
      where += ' AND cr.academic_type = ?';
      params.push(academicType);
    }
    if (query && query.trim() !== '' && query.toLowerCase() !== 'all') {
      where += ` AND (
        p.first_name LIKE ? OR
        p.last_name LIKE ? OR
        s.admission_no LIKE ? OR
        c.name LIKE ?
      )`;
      const like = `%${query}%`;
      params.push(like, like, like, like);
    }

    const [rows]: any = await connection.execute(
      `SELECT
        cr.id,
        cr.student_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        c.name as class_name,
        sub.id as subject_id,
        sub.name as subject_name,
        rt.name as result_type_name,
        cr.score,
        cr.grade,
        cr.remarks,
        cr.term_id,
        cr.created_at,
        cr.updated_at
      FROM class_results cr
      JOIN students s ON s.id = cr.student_id
      JOIN people p ON p.id = s.person_id
      JOIN classes c ON c.id = cr.class_id
      JOIN subjects sub ON sub.id = cr.subject_id
      JOIN result_types rt ON rt.id = cr.result_type_id
      ${where}
      ORDER BY p.last_name ASC, p.first_name ASC, cr.id DESC`,
      params
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching class results list:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch results' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { class_id, subject_id, result_type_id, term_id, entries } = body;

    if (!class_id || !subject_id || !result_type_id || !entries || !Array.isArray(entries)) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    connection = await getConnection();

    // Verify class belongs to this school
    const [classCheck]: any = await connection.execute(
      'SELECT id FROM classes WHERE id = ? AND school_id = ?',
      [class_id, schoolId]
    );
    if (!classCheck || classCheck.length === 0) {
      return NextResponse.json({ error: 'Class not found or access denied' }, { status: 403 });
    }

    let success = 0;
    for (const entry of entries) {
      const { student_id } = entry;
      if (!student_id) continue;
      const score = entry.score !== undefined ? entry.score : null;
      const grade = entry.grade !== undefined ? entry.grade : null;
      const remarks = entry.remarks !== undefined ? entry.remarks : null;
      await connection.execute(
        `INSERT INTO class_results (class_id, subject_id, result_type_id, term_id, student_id, score, grade, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE score=VALUES(score), grade=VALUES(grade), remarks=VALUES(remarks)`,
        [class_id, subject_id, result_type_id, term_id ?? null, student_id, score, grade, remarks]
      );
      success++;
    }

    return NextResponse.json({ success: true, inserted: success, message: 'Results updated successfully' });
  } catch (error) {
    console.error('Error updating results:', error);
    return NextResponse.json({ error: 'Failed to update results' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
