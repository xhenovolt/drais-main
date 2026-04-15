import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;

  const { searchParams } = new URL(req.url);
  const classId = searchParams.get('class_id');
  const subjectId = searchParams.get('subject_id');
  const resultTypeId = searchParams.get('result_type_id');
  const termId = searchParams.get('term_id');
  const academicYearId = searchParams.get('academic_year_id');
  const query = searchParams.get('query') || '';
  // Phase 2: curriculum filter — 'secular' | 'theology' | 'all' (default)
  const curriculum = searchParams.get('curriculum') || 'all';

  const connection = await getConnection();

  try {
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
    if (academicYearId) {
      where += ' AND (cr.academic_year_id = ? OR t.academic_year_id = ?)';
      params.push(academicYearId, academicYearId);
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
    // Phase 2: server-side curriculum filter
    if (curriculum === 'secular') {
      where += ' AND LOWER(COALESCE(sub.subject_type, \'\')) = \'secular\'';
    } else if (curriculum === 'theology') {
      where += ' AND LOWER(COALESCE(sub.subject_type, \'\')) = \'theology\'';
    }
    // curriculum === 'all' → no filter

    const [rows]: any = await connection.execute(
      `
      SELECT
        cr.id,
        cr.student_id,
        cr.class_id,
        cr.term_id,
        cr.academic_year_id,
        s.admission_no,
        p.first_name,
        p.last_name,
        p.gender,
        p.photo_url,
        c.name as class_name,
        sub.id as subject_id,
        sub.name as subject_name,
        COALESCE(sub.name_ar, '') as name_ar,
        sub.subject_type,
        rt.name as result_type_name,
        t.name as term_name,
        COALESCE(ay.name, ay2.name) as academic_year_name,
        st.name as stream_name,
        cr.score,
        cr.grade,
        cr.remarks,
        cr.created_at,
        cr.updated_at,
        IFNULL(s.status, 'inactive') AS status
      FROM class_results cr
      JOIN students s ON s.id = cr.student_id
      JOIN people p ON p.id = s.person_id
      JOIN classes c ON c.id = cr.class_id
      JOIN subjects sub ON sub.id = cr.subject_id
      JOIN result_types rt ON rt.id = cr.result_type_id
      LEFT JOIN terms t ON t.id = cr.term_id
      LEFT JOIN academic_years ay ON cr.academic_year_id = ay.id
      LEFT JOIN academic_years ay2 ON t.academic_year_id = ay2.id
      LEFT JOIN enrollments e ON e.student_id = cr.student_id AND e.class_id = cr.class_id AND (e.term_id = cr.term_id OR cr.term_id IS NULL)
      LEFT JOIN streams st ON st.id = e.stream_id
      ${where}
      ORDER BY p.last_name ASC, p.first_name ASC, cr.id DESC
      `,
      params
    );

    return NextResponse.json({ success: true, data: rows });
  } catch (error: any) {
    console.error('Reports list error:', error);
    return NextResponse.json({ 
      success: false, 
      error: 'Failed to fetch report data'
    }, { status: 500 });
  } finally {
    await connection.end(); // Ensure the connection is closed after all operations
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;

  const body = await req.json();
  const { class_id, subject_id, result_type_id, term_id, entries } = body;

  if (!entries || !Array.isArray(entries)) {
    return NextResponse.json({ error: 'Invalid or missing entries parameter' }, { status: 400 });
  }

  if (!class_id || !subject_id || !result_type_id) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
  }

  const connection = await getConnection();

  try {
    // Collect all student_ids and verify they belong to this school in one query
    const studentIds = entries.map((e: any) => e.student_id).filter(Boolean);
    const placeholders = studentIds.map(() => '?').join(',');
    const [validRows]: any = studentIds.length
      ? await connection.execute(
          `SELECT id FROM students WHERE id IN (${placeholders}) AND school_id = ? AND deleted_at IS NULL`,
          [...studentIds, schoolId],
        )
      : [[]];
    const validSet = new Set(validRows.map((r: any) => r.id));

    let success = 0;

    for (const entry of entries) {
      const { student_id, score, grade, remarks } = entry;
      if (!student_id || !validSet.has(student_id)) continue;

      await connection.execute(
        `INSERT INTO class_results (class_id, subject_id, result_type_id, term_id, student_id, score, grade, remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE score=VALUES(score), grade=VALUES(grade), remarks=VALUES(remarks)`,
        [class_id, subject_id, result_type_id, term_id ?? null, student_id, score ?? null, grade ?? null, remarks ?? null]
      );
      success++;
    }

    return NextResponse.json({ success, message: 'Results updated successfully' });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update results' }, { status: 500 });
  } finally {
    await connection.end(); // Ensure the connection is closed after all operations
  }
}
