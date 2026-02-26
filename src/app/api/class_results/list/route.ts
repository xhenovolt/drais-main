import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('class_id');
    const subjectId = searchParams.get('subject_id');
    const resultTypeId = searchParams.get('result_type_id');
    const termId = searchParams.get('term_id');
    const subjectType = searchParams.get('subject_type'); // NEW: Filter by subject_type (e.g., 'tahfiz')
    const query = searchParams.get('query') || '';

    const connection = await getConnection();

    let where = 'WHERE 1=1';
    const params: any[] = [];

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
    // NEW: Filter by subject_type (e.g., WHERE sub.subject_type = 'tahfiz')
    if (subjectType) {
      where += ' AND sub.subject_type = ?';
      params.push(subjectType);
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
      `
      SELECT
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
        cr.created_at,
        cr.updated_at
      FROM class_results cr
      JOIN students s ON s.id = cr.student_id
      JOIN people p ON p.id = s.person_id
      JOIN classes c ON c.id = cr.class_id
      JOIN subjects sub ON sub.id = cr.subject_id
      JOIN result_types rt ON rt.id = cr.result_type_id
      ${where}
      ORDER BY p.last_name ASC, p.first_name ASC, cr.id DESC
      `,
      params
    );

    await connection.end();

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Error fetching class results list:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch results' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    let { class_id, subject_id, result_type_id, term_id, entries } = body;
    class_id = class_id ?? 1;
    subject_id = subject_id ?? 1;
    result_type_id = result_type_id ?? 1;
    if (!entries) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }
    const connection = await getConnection();
    let success = 0;
    for (const entry of entries) {
      const { student_id } = entry;
      const score = entry.score !== undefined ? entry.score : null;
      const grade = entry.grade !== undefined ? entry.grade : null;
      const remarks = entry.remarks !== undefined ? entry.remarks : null;
      await connection.execute(
        `INSERT INTO class_results (class_id, subject_id, result_type_id, term_id, student_id, score, grade, remarks) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE score=VALUES(score), grade=VALUES(grade), remarks=VALUES(remarks)`,
        [class_id, subject_id, result_type_id, term_id ?? null, student_id, score, grade, remarks]
      );
      success++;
    }
    await connection.end();
    return NextResponse.json({ success, message: 'Results updated successfully' });
  } catch (error) {
    console.error('Error updating results:', error);
    return NextResponse.json({ error: 'Failed to update results' }, { status: 500 });
  }
}
