/**
 * Control Center — PERMANENT school deletion (irreversible).
 *
 * Hard delete is deliberately hard to reach: it cascades across every tenant
 * table keyed by `school_id`, so it exists only for genuine cleanup (e.g. a
 * test school). Guardrails, all enforced server-side:
 *   1. super-admin only (checked at the route),
 *   2. the school must already be SOFT-DELETED (deleted_at set),
 *   3. the caller must retype the exact school name,
 *   4. a data-heavy school is refused unless `force: true` (so a real school
 *      can't be nuked by a fat-finger).
 * Everything is audited with a per-table row-count summary.
 */
import { query, getConnection } from '@/lib/db';
import { controlAudit } from '@/lib/control/auth';

export interface SchoolFootprint { learners: number; staff: number; events: number; devices: number }

export async function schoolFootprint(schoolId: number): Promise<SchoolFootprint> {
  const n = async (sql: string) => Number(((await query(sql, [schoolId]).catch(() => [{}])) as any[])[0]?.n || 0);
  const [learners, staff, events, devices] = await Promise.all([
    n(`SELECT COUNT(*) n FROM students WHERE school_id = ?`),
    n(`SELECT COUNT(*) n FROM staff WHERE school_id = ?`),
    n(`SELECT COUNT(*) n FROM attendance_raw_events WHERE school_id = ?`),
    n(`SELECT COUNT(*) n FROM devices WHERE school_id = ?`),
  ]);
  return { learners, staff, events, devices };
}

/** A school this size is treated as "real" and requires an explicit force. */
export function looksLikeRealSchool(f: SchoolFootprint): boolean {
  return f.learners >= 20 || f.staff >= 20 || f.events >= 500;
}

/** All base tables that carry a `school_id` column (excluding `schools` itself). */
async function schoolScopedTables(): Promise<string[]> {
  const rows = (await query(
    `SELECT DISTINCT TABLE_NAME AS t
       FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'school_id' AND TABLE_NAME <> 'schools'`,
    [],
  ).catch(() => [])) as any[];
  // Defence in depth: only ever touch plain identifiers.
  return rows.map((r) => String(r.t)).filter((t) => /^[A-Za-z0-9_]+$/.test(t));
}

export interface HardDeleteResult {
  ok: boolean; reason?: string;
  deleted?: Record<string, number>; tables?: number; totalRows?: number;
}

export async function hardDeleteSchool(args: {
  schoolId: number; confirmName: string; force?: boolean; operatorId: number; ip?: string | null;
}): Promise<HardDeleteResult> {
  const rows = (await query(`SELECT id, name, deleted_at FROM schools WHERE id = ? LIMIT 1`, [args.schoolId]).catch(() => [])) as any[];
  const school = rows[0];
  if (!school) return { ok: false, reason: 'School not found' };
  if (!school.deleted_at) return { ok: false, reason: 'Soft-delete the school first, then permanently delete it.' };
  if ((args.confirmName || '').trim() !== String(school.name).trim()) {
    return { ok: false, reason: 'Type the exact school name to confirm.' };
  }
  const footprint = await schoolFootprint(args.schoolId);
  if (looksLikeRealSchool(footprint) && !args.force) {
    return { ok: false, reason: `This school holds real data (${footprint.learners} learners, ${footprint.staff} staff, ${footprint.events} events). Pass force to delete anyway.` };
  }

  const tables = await schoolScopedTables();
  const deleted: Record<string, number> = {};
  const conn = await getConnection();
  try {
    await conn.beginTransaction();
    // TiDB may or may not enforce FKs; disabling checks makes delete order
    // irrelevant and is a harmless no-op where FKs aren't enforced.
    await conn.query('SET FOREIGN_KEY_CHECKS = 0').catch(() => {});
    for (const t of tables) {
      const [r] = await conn.query(`DELETE FROM \`${t}\` WHERE school_id = ?`, [args.schoolId]);
      const affected = Number((r as any)?.affectedRows || 0);
      if (affected > 0) deleted[t] = affected;
    }
    const [sr] = await conn.query(`DELETE FROM schools WHERE id = ?`, [args.schoolId]);
    deleted['schools'] = Number((sr as any)?.affectedRows || 0);
    await conn.query('SET FOREIGN_KEY_CHECKS = 1').catch(() => {});
    await conn.commit();
  } catch (e: any) {
    await conn.rollback().catch(() => {});
    return { ok: false, reason: `Delete failed and was rolled back: ${e?.message || e}` };
  } finally {
    await conn.end().catch(() => {});
  }

  const totalRows = Object.values(deleted).reduce((a, b) => a + b, 0);
  await controlAudit(args.operatorId, 'school_hard_deleted', `schools:${args.schoolId}`,
    { name: school.name, footprint, tables: Object.keys(deleted).length, total_rows: totalRows, forced: !!args.force }, args.ip ?? null);
  return { ok: true, deleted, tables: Object.keys(deleted).length, totalRows };
}
