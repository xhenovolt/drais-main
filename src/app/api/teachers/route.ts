import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below

    connection = await getConnection();

    // Fetch staff members who are teachers from the school
    // Phase B — teacher classification is now driven by the positions
    // catalog (positions.is_teaching), not by substring matching on the
    // free-text position column. Deterministic, misspelling-proof, and
    // honours custom positions a school adds to its own catalog.
    // Canonical teacher payload: real first/last name from people (with
    // legacy denormalised-staff fallback), department + position labels.
    // The previous query stuffed "Staff <id>" into first_name which
    // leaked raw IDs into every staff picker in the app.
    const sql = `
      SELECT
        s.id,
        s.staff_no,
        COALESCE(NULLIF(pe.first_name, ''), NULLIF(s.first_name, ''), '')      AS first_name,
        COALESCE(NULLIF(pe.last_name,  ''), NULLIF(s.last_name,  ''), '')      AS last_name,
        pe.email                                                                AS email,
        pe.phone                                                                AS phone,
        s.department_id,
        d.name        AS department_name,
        p.id          AS position_id,
        p.name        AS position_name,
        p.code        AS position_code,
        pe.photo_url  AS photo_url
      FROM staff s
      LEFT JOIN positions   p  ON p.id = s.position_id
      LEFT JOIN people      pe ON pe.id = s.person_id
      LEFT JOIN departments d  ON d.id = s.department_id
      WHERE s.school_id    = ?
        AND s.status       = 'active'
        AND s.deleted_at  IS NULL
        AND p.is_teaching  = 1
        AND p.is_active    = 1
      ORDER BY p.display_order, last_name, first_name
    `;

    const [teachers] = await connection.execute(sql, [schoolId]);

    return NextResponse.json({
      success: true,
      data: teachers
    });

  } catch (error: any) {
    console.error('Teachers fetch error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to fetch teachers',
      data: []
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
