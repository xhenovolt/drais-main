/**
 * The local-sqlite counterpart to src/lib/terms.ts's getCurrentTerm() —
 * same 3-priority fallback (date-range match → any active term → latest
 * term regardless of status), queried against the local file instead of
 * the online pool. Phase 7 sub-effort 30.
 */
import type { SqliteConnection } from './repo/sqlite/connection';

export interface OfflineTerm {
  id: number;
  name: string;
  name_ar: string | null;
  academic_year_id: number;
  academic_year_name: string | null;
}

export function getCurrentTermOffline(db: SqliteConnection, schoolId: number): OfflineTerm | null {
  const today = new Date().toISOString().slice(0, 10);

  const byDate = db.prepare(`
    SELECT t.*, ay.name AS academic_year_name FROM terms t
    JOIN academic_years ay ON t.academic_year_id = ay.id
    WHERE t.school_id = ? AND t.status = 'active' AND t.start_date <= ? AND t.end_date >= ? AND t.deleted_at IS NULL
    ORDER BY t.start_date DESC LIMIT 1
  `).get(schoolId, today, today) as OfflineTerm | undefined;
  if (byDate) return byDate;

  const anyActive = db.prepare(`
    SELECT t.*, ay.name AS academic_year_name FROM terms t
    JOIN academic_years ay ON t.academic_year_id = ay.id
    WHERE t.school_id = ? AND t.status = 'active' AND t.deleted_at IS NULL
    ORDER BY t.start_date DESC LIMIT 1
  `).get(schoolId) as OfflineTerm | undefined;
  if (anyActive) return anyActive;

  const latest = db.prepare(`
    SELECT t.*, ay.name AS academic_year_name FROM terms t
    JOIN academic_years ay ON t.academic_year_id = ay.id
    WHERE t.school_id = ? AND t.deleted_at IS NULL
    ORDER BY t.start_date DESC LIMIT 1
  `).get(schoolId) as OfflineTerm | undefined;
  return latest ?? null;
}
