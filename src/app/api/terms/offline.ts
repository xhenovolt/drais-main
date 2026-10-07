import { NextRequest, NextResponse } from 'next/server';
import { langFromRequest, withDisplayName } from '@/lib/i18n/localize';

async function db() {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  return getSqliteDb();
}

/** local-sqlite branch — Phase 7 sub-effort 30, same §25a pattern. */
export async function getTerms(schoolId: number, req: NextRequest) {
  const sdb = await db();
  const terms = sdb.prepare(`
    SELECT t.id, t.name, t.name_ar,
      COALESCE(t.term_number,
        CASE
          WHEN LOWER(TRIM(t.name)) IN ('term 1','t1','first term') THEN 1
          WHEN LOWER(TRIM(t.name)) IN ('term 2','t2','second term') THEN 2
          WHEN LOWER(TRIM(t.name)) IN ('term 3','t3','third term') THEN 3
          ELSE 99
        END
      ) AS term_number,
      t.start_date, t.end_date, t.status, t.academic_year_id, ay.name as academic_year
    FROM terms t
    LEFT JOIN academic_years ay ON t.academic_year_id = ay.id
    WHERE t.school_id = ? AND t.deleted_at IS NULL
    ORDER BY ay.start_date DESC, term_number ASC, t.id ASC
  `).all(schoolId) as Record<string, unknown>[];
  const lang = langFromRequest(req);
  return NextResponse.json({ success: true, data: terms.map((r) => withDisplayName(r, lang)) });
}

/** local-sqlite branch — Phase 7 sub-effort 46, same §25a pattern. */
export async function createTerm(schoolId: number, body: any) {
  const sdb = await db();

  const name = (body.name || '').trim();
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 });
  const academic_year_id = body.academic_year_id;
  if (!academic_year_id) return NextResponse.json({ error: 'academic_year_id required' }, { status: 400 });
  const start_date = body.start_date || null;
  const end_date = body.end_date || null;
  const status = body.status || 'scheduled';
  const term_number = Number(body.term_number || 0) || null;

  const normalizedName = name.toLowerCase().replace(/\s+/g, ' ').trim();
  const dupe = sdb.prepare(
    `SELECT id FROM terms WHERE school_id = ? AND academic_year_id = ? AND deleted_at IS NULL AND LOWER(TRIM(name)) = ? LIMIT 1`
  ).get(schoolId, academic_year_id, normalizedName);
  if (dupe) return NextResponse.json({ error: 'Term already exists for this academic year' }, { status: 409 });

  const result = sdb.prepare(
    `INSERT INTO terms (school_id, academic_year_id, name, term_number, start_date, end_date, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(schoolId, academic_year_id, name, term_number, start_date, end_date, status);

  return NextResponse.json({ success: true, id: result.lastInsertRowid }, { status: 201 });
}
