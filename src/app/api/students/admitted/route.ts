import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getCurrentTerm } from '@/lib/terms';

/**
 * GET /api/students/admitted
 *
 * Returns students who have been admitted but are NOT enrolled in the
 * current active term. Used by the "Admitted" tab in the students module.
 *
 * Query params:
 *   search  — filter by name or admission_no
 *   page    — pagination (default: 1)
 *   limit   — page size (default: 50)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  const sp = req.nextUrl.searchParams;
  const search = sp.get('search')?.trim();
  const page  = Math.max(1, parseInt(sp.get('page')  || '1',  10));
  const limit = Math.min(200, Math.max(1, parseInt(sp.get('limit') || '50', 10)));
  const offset = (page - 1) * limit;

  const conn = await getConnection();
  try {
    // Resolve current term for this school
    const currentTerm = await getCurrentTerm(schoolId);
    const currentTermId = currentTerm?.id ?? null;

    const conditions: string[] = ['s.school_id = ?', 's.deleted_at IS NULL'];
    const params: any[] = [schoolId];

    // Exclude students who have an active enrollment in the current term.
    // The subquery avoids e.school_id and e.deleted_at because these columns
    // may not exist before migration 020 has been applied.  Tenant isolation is
    // already enforced by the outer s.school_id = ? condition; term isolation
    // and status = 'active' are sufficient to identify enrolled students.
    if (currentTermId) {
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.student_id = s.id
          AND e.term_id    = ?
          AND e.status     = 'active'
      )`);
      params.push(currentTermId);
    }

    if (search) {
      conditions.push('(LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ? OR s.admission_no LIKE ? OR LOWER(CONCAT(p.last_name, \' \', p.first_name)) LIKE ? OR LOWER(CONCAT(p.first_name, \' \', p.last_name)) LIKE ?)');
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like, like, like, like);
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    // Guard: both must be integers before embedding in SQL
    if (!Number.isInteger(limit) || !Number.isInteger(offset) || limit < 1 || offset < 0) {
      throw new Error(`Invalid pagination: limit=${limit} offset=${offset}`);
    }

    // Count
    const [[{ total }]] = await conn.execute<any[]>(
      `SELECT COUNT(*) AS total FROM students s LEFT JOIN people p ON s.person_id = p.id ${where}`,
      [...params]
    ) as any;

    // Data
    // LIMIT / OFFSET are embedded as literals (not ? params) — TiDB raises
    // "Incorrect arguments to LIMIT" when they arrive as bound parameters via
    // mysql2. Values are validated integers above.
    const [rows] = await conn.execute<any[]>(
      `SELECT
         s.id,
         s.admission_no,
         s.status,
         s.admission_date,
         p.first_name,
         p.last_name,
         p.other_name,
         p.gender,
         p.date_of_birth,
         p.photo_url,
         p.phone,
         p.email
       FROM students s
       LEFT JOIN people p ON s.person_id = p.id
       ${where}
       ORDER BY COALESCE(p.last_name, '') ASC, COALESCE(p.first_name, '') ASC
       LIMIT ${limit} OFFSET ${offset}`,
      [...params]
    );

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        current_term_id: currentTermId,
        current_term_name: currentTerm?.name ?? null,
      },
    });
  } catch (err) {
    console.error('[students/admitted] error:', err);
    return NextResponse.json({ error: 'Failed to fetch admitted students' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
