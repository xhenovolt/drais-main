import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';

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
    const resultTypeId = searchParams.get('result_type_id');
    const academicType = searchParams.get('academic_type') || 'secular';

    if (!classId || !resultTypeId) {
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

    // Get existing results for the class, term, and result type
    let query = `
      SELECT cr.student_id, cr.subject_id, cr.score, cr.grade, cr.remarks,
             p.first_name, p.last_name, s.admission_no
      FROM class_results cr
      JOIN students s ON s.id = cr.student_id AND s.deleted_at IS NULL
      JOIN people p ON p.id = s.person_id AND p.deleted_at IS NULL
      WHERE cr.class_id = ? AND cr.result_type_id = ? AND s.school_id = ?`;

    const params: any[] = [classId, resultTypeId, schoolId];

    if (termId) {
      query += ` AND cr.term_id = ?`;
      params.push(termId);
    } else {
      query += ` AND cr.term_id IS NULL`;
    }

    if (academicType) {
      query += ` AND cr.academic_type = ?`;
      params.push(academicType);
    }

    const [results]: any = await connection.execute(query, params);

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Error fetching bulk results:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch bulk results' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}