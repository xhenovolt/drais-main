import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const classId = searchParams.get('class_id');
    const subjectId = searchParams.get('subject_id');
    const resultTypeId = searchParams.get('result_type_id');
    const termId = searchParams.get('term_id');

    const connection = await getConnection();

    let query = `
      SELECT 
        cr.id,
        cr.student_id,
        cr.class_id,
        cr.subject_id,
        cr.term_id,
        cr.result_type_id,
        cr.score,
        cr.grade,
        cr.remarks,
        cr.created_at,
        cr.updated_at,
        p.first_name,
        p.last_name,
        c.name as class_name,
        s.name as subject_name,
        rt.name as result_type_name,
        t.name as term_name
      FROM class_results cr
      JOIN students st ON cr.student_id = st.id
      JOIN people p ON st.person_id = p.id
      JOIN classes c ON cr.class_id = c.id
      JOIN subjects s ON cr.subject_id = s.id
      JOIN result_types rt ON cr.result_type_id = rt.id
      LEFT JOIN terms t ON cr.term_id = t.id
      WHERE 1=1
    `;

    const params = [];

    if (classId) {
      query += ' AND cr.class_id = ?';
      params.push(classId);
    }

    if (subjectId) {
      query += ' AND cr.subject_id = ?';
      params.push(subjectId);
    }

    if (resultTypeId) {
      query += ' AND cr.result_type_id = ?';
      params.push(resultTypeId);
    }

    if (termId) {
      query += ' AND cr.term_id = ?';
      params.push(termId);
    }

    query += ' ORDER BY p.last_name, p.first_name, s.name';

    const [results] = await connection.execute(query, params);
    await connection.end();

    return NextResponse.json({
      success: true,
      data: results
    });

  } catch (error) {
    console.error('Error fetching class results:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
