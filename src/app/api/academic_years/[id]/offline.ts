import { NextResponse } from 'next/server';

/**
 * local-sqlite branch — Phase 7 sub-effort 46, same §25a pattern. The local
 * `academic_years` table deliberately has no `created_at`/`updated_at`
 * columns (schema.ts's own header comment: this matches the real online
 * table exactly) — the online route's `updated_at = NOW()` is dropped here
 * rather than guessed at, not an oversight.
 */
export async function updateAcademicYear(schoolId: number, id: string, body: any) {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const sdb = getSqliteDb();
  const { status, name, start_date, end_date } = body;

  const fields: string[] = [];
  const values: any[] = [];

  if (status !== undefined) {
    const allowed = ['draft', 'active', 'closed'];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
    }
    fields.push('status = ?');
    values.push(status);

    if (status === 'active') {
      sdb.prepare(
        `UPDATE academic_years SET status = 'closed' WHERE school_id = ? AND id != ? AND status = 'active'`
      ).run(schoolId, id);
    }
  }
  if (name !== undefined)       { fields.push('name = ?');       values.push(name); }
  if (start_date !== undefined) { fields.push('start_date = ?'); values.push(start_date || null); }
  if (end_date !== undefined)   { fields.push('end_date = ?');   values.push(end_date || null); }

  if (fields.length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  values.push(schoolId, id);
  const result = sdb.prepare(
    `UPDATE academic_years SET ${fields.join(', ')} WHERE school_id = ? AND id = ? AND deleted_at IS NULL`
  ).run(...values);

  if (result.changes === 0) {
    return NextResponse.json({ error: 'Academic year not found' }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}
