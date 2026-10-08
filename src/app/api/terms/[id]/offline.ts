import { NextResponse } from 'next/server';

/**
 * local-sqlite branch — Phase 7 sub-effort 46, same §25a pattern. Both
 * writes the online is_active cascade makes (is_active AND status='active'
 * together) are replicated exactly. `logAudit()` is skipped here, not
 * forgotten — it calls query(), which throws for local-sqlite by design
 * (src/lib/db/pools.ts's assertMysqlMode()), and no offline branch
 * anywhere in this codebase has an audit-log table to write to instead;
 * the online call is itself best-effort (wrapped in its own try/catch),
 * so the audit trail simply doesn't exist offline yet, same as every
 * other not-yet-modeled-locally feature.
 */
export async function updateTerm(schoolId: number, termId: number, body: any) {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  const sdb = getSqliteDb();

  if (body.is_active !== undefined) {
    const makeActive = !!body.is_active;
    if (makeActive) {
      sdb.prepare(`UPDATE terms SET is_active = 0 WHERE school_id = ? AND id <> ? AND deleted_at IS NULL`).run(schoolId, termId);
      sdb.prepare(`UPDATE terms SET is_active = 1, status = 'active' WHERE id = ? AND school_id = ? AND deleted_at IS NULL`).run(termId, schoolId);
    } else {
      sdb.prepare(`UPDATE terms SET is_active = 0 WHERE id = ? AND school_id = ? AND deleted_at IS NULL`).run(termId, schoolId);
    }
  }

  const sets: string[] = [];
  const vals: unknown[] = [];
  if (body.name       !== undefined) { sets.push('name = ?');       vals.push(body.name); }
  if (body.start_date !== undefined) { sets.push('start_date = ?'); vals.push(body.start_date); }
  if (body.end_date   !== undefined) { sets.push('end_date = ?');   vals.push(body.end_date); }
  if (body.status     !== undefined) { sets.push('status = ?');     vals.push(body.status); }

  if (sets.length > 0) {
    vals.push(termId, schoolId);
    sdb.prepare(`UPDATE terms SET ${sets.join(', ')} WHERE id = ? AND school_id = ? AND deleted_at IS NULL`).run(...vals);
  }

  if (sets.length === 0 && body.is_active === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
