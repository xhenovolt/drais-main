import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
import { langFromRequest, withDisplayName } from '@/lib/i18n/localize';
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
    // schoolId derived from session below

    connection = await getConnection();

    const [terms] = await connection.execute(
      `
      SELECT
        t.id,
        t.name,
        t.name_ar,
        COALESCE(t.term_number,
          CASE
            WHEN LOWER(TRIM(t.name)) IN ('term 1','t1','first term') THEN 1
            WHEN LOWER(TRIM(t.name)) IN ('term 2','t2','second term') THEN 2
            WHEN LOWER(TRIM(t.name)) IN ('term 3','t3','third term') THEN 3
            ELSE 99
          END
        ) AS term_number,
        t.start_date,
        t.end_date,
        t.status,
        t.academic_year_id,
        ay.name as academic_year
      FROM terms t
      LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
      WHERE t.school_id = ?
        AND t.deleted_at IS NULL
      ORDER BY ay.start_date DESC, term_number ASC, t.id ASC
    `,
      [schoolId]
    );

    const lang = langFromRequest(req);
    const data = (terms as Record<string, unknown>[]).map(r => withDisplayName(r, lang));
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('Terms fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch terms',
      },
      { status: 500 }
    );
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = (body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  // schoolId comes from session (school_id variable)
  const academic_year_id = body.academic_year_id;
  const start_date = body.start_date || null;
  const end_date = body.end_date || null;
  const status = body.status || 'scheduled';
  const term_number = Number(body.term_number || 0) || null;

  if (!academic_year_id) {
    return NextResponse.json({ error: 'academic_year_id required' }, { status: 400 });
  }
  const connection = await getConnection();
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const normalizedName = name.toLowerCase().replace(/\s+/g, ' ').trim();
    const [dupes]: any = await connection.execute(
      `
      SELECT id
      FROM terms
      WHERE school_id = ?
        AND academic_year_id = ?
        AND deleted_at IS NULL
        AND LOWER(TRIM(name)) = ?
      LIMIT 1
      `,
      [schoolId, academic_year_id, normalizedName]
    );
    if (dupes.length > 0) {
      return NextResponse.json({ error: 'Term already exists for this academic year' }, { status: 409 });
    }

    const [result] = await connection.execute(
      `
      INSERT INTO terms (school_id, academic_year_id, name, term_number, start_date, end_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [schoolId, academic_year_id, name, term_number, start_date, end_date, status]
    );
    const insertId = (result as any).insertId;
    return NextResponse.json({ success: true, id: insertId }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
