/**
 * Control Center — per-tenant data export (Phase 22 / E-19).
 *
 * TiDB Cloud takes automated snapshot backups of the whole cluster, but that's
 * not something an operator can hold or hand over. This produces an
 * operator-controlled, per-school export: every row across every `school_id`-
 * scoped table for one school, as JSON — a portable backup / DR extract / "give
 * me my data" artefact, and the natural export-before-hard-delete safeguard.
 *
 * Super-admin only + audited at the route. Row counts are bounded per table so
 * one export can't exhaust memory.
 */
import { query } from '@/lib/db';

const MAX_ROWS_PER_TABLE = 100_000;

/** All base tables carrying a `school_id` column (validated identifiers only). */
async function schoolScopedTables(): Promise<string[]> {
  const rows = (await query(
    `SELECT DISTINCT TABLE_NAME AS t FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND COLUMN_NAME = 'school_id' AND TABLE_NAME <> 'schools'`,
    [],
  ).catch(() => [])) as any[];
  return rows.map((r) => String(r.t)).filter((t) => /^[A-Za-z0-9_]+$/.test(t));
}

export interface SchoolExport {
  exported_at: string;
  school: any;
  table_count: number;
  total_rows: number;
  truncated_tables: string[];
  tables: Record<string, any[]>;
}

/** Export one school's full dataset across every school-scoped table. */
export async function exportSchoolData(schoolId: number): Promise<{ ok: boolean; reason?: string; data?: SchoolExport }> {
  const schoolRows = (await query(`SELECT * FROM schools WHERE id = ? LIMIT 1`, [schoolId]).catch(() => [])) as any[];
  if (!schoolRows[0]) return { ok: false, reason: 'School not found' };

  const tables = await schoolScopedTables();
  const out: Record<string, any[]> = {};
  const truncated: string[] = [];
  let totalRows = 0;

  for (const t of tables) {
    const rows = (await query(
      `SELECT * FROM \`${t}\` WHERE school_id = ? LIMIT ${MAX_ROWS_PER_TABLE + 1}`, [schoolId],
    ).catch(() => [])) as any[];
    if (rows.length > MAX_ROWS_PER_TABLE) { truncated.push(t); rows.length = MAX_ROWS_PER_TABLE; }
    if (rows.length) { out[t] = rows; totalRows += rows.length; }
  }

  return {
    ok: true,
    data: {
      exported_at: new Date().toISOString(),
      school: schoolRows[0],
      table_count: Object.keys(out).length,
      total_rows: totalRows,
      truncated_tables: truncated,
      tables: out,
    },
  };
}
