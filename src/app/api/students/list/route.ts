export const runtime = "nodejs";

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { langFromRequest, personDisplayName } from '@/lib/i18n/localize';

/**
 * GET /api/students/list
 * 
 * ⚠️ CRITICAL: This endpoint returns ALL STUDENTS (600+) for the school.
 * NO enrollment join filtering - admission and enrollment are SEPARATE concerns.
 * 
 * OPTIONAL QUERY PARAMETERS:
 * - search: Search by name or admission_no (LIKE %search%)
 * - status: Filter by status (active, left, graduated, suspended)
 * - view: "all" | "enrolled" | "admitted" (default: "all")
 * 
 * REMOVED: pagination, classId filtering (use separate endpoints)
 * Frontend will handle pagination if needed. A SAFETY_LIMIT (10,000 rows)
 * guards against an unbounded response at extreme scale — see `truncated`
 * in the response; no real school approaches this today.
 * 
 * Security:
 * - Requires authentication
 * - Filters by school_id = ? (MANDATORY on all queries, NOexceptions)
 * - Respects soft deletes (deleted_at IS NULL)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    
    // Query parameters
    const search = req.nextUrl.searchParams.get('search') || '';
    const status = req.nextUrl.searchParams.get('status') || '';
    const view = req.nextUrl.searchParams.get('view') || 'all'; // all | enrolled | admitted | trash

    // Build base WHERE clause (NO enrollment dependency). The Trash view shows
    // ONLY soft-deleted learners; every other view hides them.
    const deletedCond = view === 'trash' ? 's.deleted_at IS NOT NULL' : 's.deleted_at IS NULL';
    let whereClause = `s.school_id = ? AND ${deletedCond}`;
    const params: any[] = [schoolId];

    // Apply search filter (works independently of enrollment)
    if (search.trim()) {
      whereClause += ` AND (
        LOWER(p.first_name) LIKE LOWER(?) 
        OR LOWER(p.last_name) LIKE LOWER(?) 
        OR s.admission_no LIKE ?
      )`;
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    // Apply status filter
    if (status.trim() && ['active', 'left', 'graduated', 'suspended'].includes(status)) {
      whereClause += ' AND s.status = ?';
      params.push(status);
    }

    // Get total count (BEFORE pagination, full dataset)
    let countQuery = `SELECT COUNT(DISTINCT s.id) as total FROM students s
                      JOIN people p ON s.person_id = p.id`;

    if (view === 'enrolled') {
      countQuery += ` INNER JOIN enrollments e ON s.id = e.student_id AND e.school_id = s.school_id`;
    } else if (view === 'admitted') {
      countQuery += ` LEFT JOIN enrollments e ON s.id = e.student_id AND e.school_id = s.school_id`;
      whereClause += ' AND e.id IS NULL';
    }

    countQuery += ` WHERE ${whereClause}`;

    const [countResult]: any = await conn.execute(countQuery, params);
    const total = countResult[0].total;

    // Get students (NO PAGINATION - return all matching records)
    let selectQuery = `SELECT DISTINCT
        s.id,
        s.person_id,
        s.admission_no,
        s.status,
        s.admission_date,
        s.deleted_at,
        s.delete_reason,
        p.first_name,
        p.last_name,
        p.other_name,
        p.first_name_ar,
        p.last_name_ar,
        p.other_name_ar,
        p.full_name_ar,
        p.gender,
        p.date_of_birth,
        p.photo_url,
        (SELECT COUNT(*) FROM enrollments WHERE student_id = s.id AND school_id = s.school_id) as enrollment_count,
        (SELECT COUNT(*) FROM results WHERE student_id = s.id AND school_id = s.school_id) as result_count
      FROM students s
      JOIN people p ON s.person_id = p.id`;

    if (view === 'enrolled') {
      selectQuery += ` INNER JOIN enrollments e ON s.id = e.student_id AND e.school_id = s.school_id`;
    } else if (view === 'admitted') {
      selectQuery += ` LEFT JOIN enrollments e ON s.id = e.student_id AND e.school_id = s.school_id`;
    }

    // Safety ceiling, not real pagination — this endpoint is deliberately
    // "return everything" (frontend does bulk-select/search over the full
    // roster), which is fine at real-world school sizes (hundreds to a
    // few thousand). LIMIT 10001 (one over the cap) so `truncated` can be
    // detected without a second COUNT query; no real school hits this
    // today, it exists purely so one can never turn into an unbounded
    // full-table scan/response.
    const SAFETY_LIMIT = 10000;
    selectQuery += ` WHERE ${whereClause}
      ORDER BY ${view === 'trash' ? 's.deleted_at DESC' : 'p.first_name ASC, p.last_name ASC'}
      LIMIT ${SAFETY_LIMIT + 1}`;

    const [rawRows]: any = await conn.execute(selectQuery, params);
    const truncated = rawRows.length > SAFETY_LIMIT;
    const rows = truncated ? rawRows.slice(0, SAFETY_LIMIT) : rawRows;

    // Localize: add a language-aware display_name (Arabic full name with EN
    // fallback) plus arabic_name_missing so the UI can flag learners that still
    // need an Arabic name. English mode leaves display_name == the English name.
    const lang = langFromRequest(req);
    const data = (rows as Record<string, any>[]).map(r => {
      const hasArabic = !!(
        (r.full_name_ar && String(r.full_name_ar).trim()) ||
        (r.first_name_ar && String(r.first_name_ar).trim()) ||
        (r.last_name_ar && String(r.last_name_ar).trim())
      );
      return {
        ...r,
        display_name: personDisplayName(lang, r),
        arabic_name_missing: !hasArabic,
      };
    });

    // Validation: log counts for debugging
    console.log(`[STUDENTS LIST] school_id=${schoolId}, view=${view}, search='${search}', status='${status}', returned=${rows.length}, total=${total}`);

    return NextResponse.json({
      success: true,
      view,
      total,
      returned: rows.length,
      truncated,
      school_id: schoolId,
      data
    });
  } catch (error: any) {
    console.error('Error fetching students:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch students' },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}
