import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { isSubjectAllocatedToClass } from '@/lib/subject-allocation-validation';

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
    // School scope enforcement - prevent data leakage across schools
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
    // Curriculum filtering moved to frontend - API returns all data
    // No server-side curriculum filtering to allow flexible frontend filtering

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
        sub.academic_type,
        (
          SELECT GROUP_CONCAT(
            NULLIF(CONCAT_WS(' ', tp.first_name, tp.last_name), '')
            ORDER BY (cs2.allocation_role = 'primary_teacher') DESC, cs2.id ASC
            SEPARATOR ' / '
          )
          FROM class_subjects cs2
          LEFT JOIN staff ts ON ts.id = cs2.teacher_id
          LEFT JOIN people tp ON tp.id = ts.person_id
          WHERE cs2.class_id = cr.class_id
            AND cs2.subject_id = cr.subject_id
            AND COALESCE(cs2.display_on_report, 1) = 1
            AND (cs2.status IS NULL OR cs2.status = 'active')
            AND (cs2.valid_from IS NULL OR cs2.valid_from <= COALESCE(t.start_date, CURRENT_TIMESTAMP))
            AND (cs2.valid_to IS NULL OR cs2.valid_to > COALESCE(t.start_date, CURRENT_TIMESTAMP))
        ) AS teacher_name,
        (
          SELECT GROUP_CONCAT(
            COALESCE(
              NULLIF(TRIM(cs2.custom_initials), ''),
              NULLIF(CONCAT(
                COALESCE(LEFT(tp.first_name, 1), ''),
                COALESCE(LEFT(tp.last_name, 1), '')
              ), '')
            )
            ORDER BY (cs2.allocation_role = 'primary_teacher') DESC, cs2.id ASC
            SEPARATOR ' / '
          )
          FROM class_subjects cs2
          LEFT JOIN staff ts ON ts.id = cs2.teacher_id
          LEFT JOIN people tp ON tp.id = ts.person_id
          WHERE cs2.class_id = cr.class_id
            AND cs2.subject_id = cr.subject_id
            AND COALESCE(cs2.display_on_report, 1) = 1
            AND (cs2.status IS NULL OR cs2.status = 'active')
            AND (cs2.valid_from IS NULL OR cs2.valid_from <= COALESCE(t.start_date, CURRENT_TIMESTAMP))
            AND (cs2.valid_to IS NULL OR cs2.valid_to > COALESCE(t.start_date, CURRENT_TIMESTAMP))
        ) AS teacher_initials,
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
      LEFT JOIN enrollments e ON e.student_id = cr.student_id AND e.class_id = cr.class_id
      LEFT JOIN streams st ON st.id = e.stream_id
      ${where}
      ORDER BY p.last_name ASC, p.first_name ASC, cr.id DESC
      `,
      params
    ).catch(err => {
      console.error('Term facets error:', err);
      return [[]];
    });

    const [termFacets]: any = await connection.execute(
      `
      SELECT
        t.id AS term_id,
        t.name AS term_name,
        COALESCE(t.term_number,
          CASE
            WHEN LOWER(TRIM(t.name)) IN ('term 1','t1','first term') THEN 1
            WHEN LOWER(TRIM(t.name)) IN ('term 2','t2','second term') THEN 2
            WHEN LOWER(TRIM(t.name)) IN ('term 3','t3','third term') THEN 3
            ELSE 99
          END
        ) AS term_number,
        COUNT(DISTINCT cr.student_id) AS student_count,
        COUNT(*) AS result_count
      FROM class_results cr
      JOIN students s ON s.id = cr.student_id
      LEFT JOIN terms t ON t.id = cr.term_id
      WHERE s.school_id = ?
      GROUP BY t.id, t.name, term_number
      ORDER BY term_number ASC, t.id ASC
      `,
      [schoolId]
    ).catch(err => {
      console.error('Term facets error:', err);
      return [[]];
    });

    const [classFacets]: any = await connection.execute(
      `
      SELECT
        c.id AS class_id,
        c.name AS class_name,
        COUNT(DISTINCT cr.student_id) AS student_count,
        COUNT(*) AS result_count
      FROM class_results cr
      JOIN students s ON s.id = cr.student_id
      LEFT JOIN classes c ON c.id = cr.class_id
      LEFT JOIN terms t ON t.id = cr.term_id
      LEFT JOIN enrollments e ON e.student_id = cr.student_id AND e.class_id = cr.class_id
      WHERE s.school_id = ?
      GROUP BY c.id, c.name
      ORDER BY c.name ASC
      `,
      [schoolId]
    ).catch(err => {
      console.error('Class facets error:', err);
      return [[]];
    });

    return NextResponse.json({
      success: true,
      data: rows,
      facets: {
        terms: termFacets,
        classes: classFacets,
      },
    });
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
    // ENFORCE: Verify subject is allocated to this class
    const subjectAllocated = await isSubjectAllocatedToClass(connection, class_id, subject_id);
    if (!subjectAllocated) {
      const [subjectName]: any = await connection.execute(
        'SELECT name FROM subjects WHERE id = ?',
        [subject_id]
      );
      const subjName = subjectName?.length > 0 ? subjectName[0].name : `ID: ${subject_id}`;
      await connection.end();
      return NextResponse.json({
        error: `Subject Allocation Violation: "${subjName}" is not allocated to this class. Results cannot be entered for subjects not in the class allocation.`,
        code: 'SUBJECT_NOT_ALLOCATED'
      }, { status: 400 });
    }

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
