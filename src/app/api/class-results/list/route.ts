import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/class-results/list
 *
 * Returns paginated class results with filtering, search, and sort.
 * Tenant-isolated by school_id from session.
 *
 * Query params:
 *   class_id        — filter by class
 *   subject_id      — filter by subject
 *   result_type_id  — filter by result type
 *   term_id         — filter by term
 *   search          — search by student name or admission_no
 *   sort_by         — 'name' | 'score' | 'class' (default: 'name')
 *   sort_order      — 'asc' | 'desc' (default: 'asc')
 *   page            — page number (default: 1)
 *   limit           — page size: 20 | 50 | 100 (default: 50, max: 200)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  try {
    const sp = req.nextUrl.searchParams;
    const classId      = sp.get('class_id');
    const subjectId    = sp.get('subject_id');
    const resultTypeId = sp.get('result_type_id');
    const termId       = sp.get('term_id');
    const search       = sp.get('search')?.trim();
    const sortBy       = sp.get('sort_by') || 'name';
    const sortOrder    = sp.get('sort_order')?.toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const page         = Math.max(1, parseInt(sp.get('page', 10) || '1', 10));
    const limit        = Math.min(200, Math.max(1, parseInt(sp.get('limit', 10) || '50', 10)));
    const offset       = (page - 1) * limit;

    if (!Number.isInteger(limit) || !Number.isInteger(offset) || limit < 1 || offset < 0) {
      throw new Error(`Invalid pagination: limit=${limit} offset=${offset}`);
    }

    const connection = await getConnection();
    try {
      const conditions: string[] = ['st.school_id = ?'];
      const params: any[] = [schoolId];

      if (classId)      { conditions.push('cr.class_id = ?');       params.push(classId); }
      if (subjectId)    { conditions.push('cr.subject_id = ?');     params.push(subjectId); }
      if (resultTypeId) { conditions.push('cr.result_type_id = ?'); params.push(resultTypeId); }
      if (termId)       { conditions.push('cr.term_id = ?');        params.push(termId); }

      if (search) {
        conditions.push(
          '(LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ? OR st.admission_no LIKE ? OR LOWER(CONCAT(p.last_name, \' \', p.first_name)) LIKE ? OR LOWER(CONCAT(p.first_name, \' \', p.last_name)) LIKE ?)'
        );
        const like = `%${search.toLowerCase()}%`;
        params.push(like, like, like, like, like);
      }

      const where = 'WHERE ' + conditions.join(' AND ');

      // Build ORDER BY
      const orderMap: Record<string, string> = {
        name:  "COALESCE(p.first_name,'') ASC, COALESCE(p.last_name,'') ASC",
        score: `cr.score ${sortOrder}`,
        class: `c.name ${sortOrder}, COALESCE(p.first_name,'') ASC`,
      };
      const orderBy = orderMap[sortBy] ?? orderMap['name'];

      // Count
      const [[{ total }]] = await connection.execute<any[]>(
        `SELECT COUNT(*) AS total
         FROM class_results cr
         JOIN students st ON cr.student_id = st.id
         JOIN people p ON st.person_id = p.id
         JOIN classes c ON cr.class_id = c.id
         JOIN subjects s ON cr.subject_id = s.id
         JOIN result_types rt ON cr.result_type_id = rt.id
         LEFT JOIN terms t ON cr.term_id = t.id
         ${where}`,
        [...params]
      ) as any;

      // Data
      const [results] = await connection.execute(
        `SELECT
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
           st.admission_no,
           c.name AS class_name,
           s.name AS subject_name,
           s.subject_type,
           rt.name AS result_type_name,
           t.name AS term_name,
           cur.name AS program_name
         FROM class_results cr
         JOIN students st ON cr.student_id = st.id
         JOIN people p ON st.person_id = p.id
         JOIN classes c ON cr.class_id = c.id
         JOIN subjects s ON cr.subject_id = s.id
         JOIN result_types rt ON cr.result_type_id = rt.id
         LEFT JOIN terms t ON cr.term_id = t.id
         LEFT JOIN student_curriculums sc ON sc.student_id = st.id AND sc.active = 1
         LEFT JOIN curriculums cur ON cur.id = sc.curriculum_id
         ${where}
         ORDER BY ${orderBy}
         LIMIT ${limit} OFFSET ${offset}`,
        [...params]
      );

      return NextResponse.json({
        success: true,
        data: results,
        meta: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
      });
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Error fetching class results:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
