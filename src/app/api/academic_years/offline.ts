import { NextResponse } from 'next/server';

async function db() {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  return getSqliteDb();
}

/** local-sqlite branch — Phase 7 sub-effort 30, same §25a pattern. */
export async function getAcademicYears(schoolId: number) {
  const sdb = await db();
  const rows = sdb.prepare(
    `SELECT id, school_id, name, start_date, end_date, status FROM academic_years WHERE school_id = ? AND deleted_at IS NULL ORDER BY start_date DESC, id DESC`
  ).all(schoolId);
  return NextResponse.json({ success: true, data: rows });
}

/** local-sqlite branch — Phase 7 sub-effort 46, same §25a pattern. */
export async function createAcademicYear(schoolId: number, body: any) {
  const sdb = await db();
  const { name, start_date, end_date, status } = body;

  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  const normalizedName = String(name).trim();

  const existing = sdb.prepare(
    `SELECT id FROM academic_years WHERE school_id = ? AND deleted_at IS NULL AND TRIM(name) = ? LIMIT 1`
  ).get(schoolId, normalizedName);
  if (existing) return NextResponse.json({ error: 'Academic year already exists' }, { status: 409 });

  const result = sdb.prepare(
    `INSERT INTO academic_years (school_id, name, start_date, end_date, status) VALUES (?, ?, ?, ?, ?)`
  ).run(schoolId, normalizedName, start_date || null, end_date || null, status || 'draft');

  return NextResponse.json({ success: true, id: result.lastInsertRowid });
}
