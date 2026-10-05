import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getCurrentTerm } from '@/lib/terms';
import { langFromRequest, personDisplayName } from '@/lib/i18n/localize';
import { getDbMode } from '@/lib/db/db-mode';

/**
 * local-sqlite branch — Phase 7 sub-effort 30, same §25a pattern as every
 * prior Students route. This is the FIRST of /students/list's two primary
 * data-fetch endpoints (the other is /api/students/enrolled, same file
 * pattern, sibling route). getCurrentTermOffline mirrors getCurrentTerm's
 * exact 3-priority fallback against the local file.
 */
async function offlineGetAdmitted(schoolId: number, searchParams: URLSearchParams, req: NextRequest) {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const { getCurrentTermOffline } = await import('@/lib/terms-offline');
  const db = getSqliteDb();
  const search = searchParams.get('search')?.trim();

  const currentTerm = getCurrentTermOffline(db, schoolId);
  const currentTermId = currentTerm?.id ?? null;

  const conditions: string[] = ['s.school_id = ?', 's.deleted_at IS NULL'];
  const params: any[] = [schoolId];
  if (currentTermId) {
    conditions.push(`NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.id AND e.term_id = ?)`);
    params.push(currentTermId);
  }
  if (search) {
    conditions.push("(LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ? OR s.admission_no LIKE ? OR LOWER(p.last_name || ' ' || p.first_name) LIKE ? OR LOWER(p.first_name || ' ' || p.last_name) LIKE ?)");
    const like = `%${search.toLowerCase()}%`;
    params.push(like, like, like, like, like);
  }
  const where = 'WHERE ' + conditions.join(' AND ');

  // Arabic name fields (first_name_ar etc.) are not in the local `people`
  // table at all — never carried into the offline copy (PersonRecord/
  // seedPerson never captured them; confirmed by reading schema.ts) — so
  // these are literal NULLs here, not a query bug. arabic_name_missing
  // below is therefore always true offline; an honest existing gap
  // (bilingual name support), not something this sub-effort invents.
  const rows = db.prepare(`
    SELECT s.id, s.person_id, s.admission_no, s.status, s.admission_date, NULL AS residency_status,
           p.first_name, p.last_name, p.other_name,
           NULL AS first_name_ar, NULL AS last_name_ar, NULL AS other_name_ar, NULL AS full_name_ar,
           p.gender, p.date_of_birth, p.photo_url, p.phone, p.email
    FROM students s
    LEFT JOIN people p ON s.person_id = p.id
    ${where}
    ORDER BY p.first_name ASC, p.last_name ASC
    LIMIT 10001
  `).all(...params) as Record<string, any>[];
  const truncated = rows.length > 10000;
  const finalRows = truncated ? rows.slice(0, 10000) : rows;

  const lang = langFromRequest(req);
  for (const row of finalRows) {
    row.display_name = personDisplayName(lang, row);
    row.arabic_name_missing = !((row.full_name_ar && String(row.full_name_ar).trim()) || (row.first_name_ar && String(row.first_name_ar).trim()) || (row.last_name_ar && String(row.last_name_ar).trim()));
  }

  return NextResponse.json({
    success: true, data: finalRows,
    meta: { total: finalRows.length, truncated, current_term_id: currentTermId, current_term_name: currentTerm?.name ?? null },
  });
}

/**
 * GET /api/students/admitted
 *
 * Returns students who have been admitted but are NOT enrolled in the
 * current active term. Used by the "Admitted" tab in the students module.
 * School isolation enforced: only returns data for authenticated school.
 *
 * Query params:
 *   search  — filter by name or admission_no (optional)
 *
 * ALL results returned (no backend pagination — frontend handles).
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;
  const sp = req.nextUrl.searchParams;

  if (getDbMode() === 'local-sqlite') {
    return offlineGetAdmitted(schoolId, sp, req);
  }

  const search = sp.get('search')?.trim();

  const conn = await getConnection();
  try {
    // Resolve current term for this school
    const currentTerm = await getCurrentTerm(schoolId);
    const currentTermId = currentTerm?.id ?? null;

    const conditions: string[] = ['s.school_id = ?', 's.deleted_at IS NULL'];
    const params: any[] = [schoolId];

    // Exclude students who have ANY enrollment row in the current term —
    // not just an 'active' one. /api/students/enrolled shows a student for
    // a term as soon as an enrollment row exists for it, regardless of
    // status (no default status filter there). Requiring status='active'
    // here as well as the exclusion condition let the two lists disagree:
    // a student whose current-term enrollment exists but isn't (yet, or no
    // longer) literally 'active' — e.g. mid class-promotion, where a
    // rollover can leave a term's enrollment row 'closed' or similarly
    // non-active for a period — showed as both "admitted" (not excluded
    // here) and "enrolled" (not filtered there). Confirmed live at
    // Nakifuma High School. "Admitted but not enrolled this term" should
    // mean no enrollment record for the term at all, not "no ACTIVE one."
    // The subquery avoids e.school_id and e.deleted_at because these columns
    // may not exist before migration 020 has been applied. Tenant isolation
    // is already enforced by the outer s.school_id = ? condition; term
    // isolation is sufficient to identify enrolled students.
    if (currentTermId) {
      conditions.push(`NOT EXISTS (
        SELECT 1 FROM enrollments e
        WHERE e.student_id = s.id
          AND e.term_id    = ?
      )`);
      params.push(currentTermId);
    }

    if (search) {
      conditions.push('(LOWER(p.first_name) LIKE ? OR LOWER(p.last_name) LIKE ? OR s.admission_no LIKE ? OR LOWER(CONCAT(p.last_name, \' \', p.first_name)) LIKE ? OR LOWER(CONCAT(p.first_name, \' \', p.last_name)) LIKE ?)');
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like, like, like, like);
    }

    const where = 'WHERE ' + conditions.join(' AND ');

    // Fetch all admitted students (no pagination — frontend handles).
    // SAFETY_LIMIT guards against an unbounded response at extreme scale
    // (see students/list's identical pattern) — no real school hits this.
    const SAFETY_LIMIT = 10000;
    const [rawRows] = await conn.execute<any[]>(
      `SELECT
         s.id,
         s.person_id,
         s.admission_no,
         s.status,
         s.admission_date,
         s.residency_status,
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
         p.phone,
         p.email
       FROM students s
       LEFT JOIN people p ON s.person_id = p.id
       ${where}
       ORDER BY p.first_name ASC, p.last_name ASC
       LIMIT ${SAFETY_LIMIT + 1}`,
      [...params]
    );
    const truncated = rawRows.length > SAFETY_LIMIT;
    const rows = truncated ? rawRows.slice(0, SAFETY_LIMIT) : rawRows;

    const lang = langFromRequest(req);
    for (const row of rows as Record<string, any>[]) {
      row.display_name = personDisplayName(lang, row);
      row.arabic_name_missing = !(
        (row.full_name_ar && String(row.full_name_ar).trim()) ||
        (row.first_name_ar && String(row.first_name_ar).trim()) ||
        (row.last_name_ar && String(row.last_name_ar).trim())
      );
    }

    console.log(`[ADMITTED STUDENTS] school=${schoolId}, returned=${rows.length}, term=${currentTermId}`);

    return NextResponse.json({
      success: true,
      data: rows,
      meta: {
        total: rows.length,
        truncated,
        current_term_id: currentTermId,
        current_term_name: currentTerm?.name ?? null,
      },
    });
  } catch (err) {
    console.error('[students/admitted] error:', err);
    return NextResponse.json({ success: false, message: 'Failed to fetch admitted students' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
