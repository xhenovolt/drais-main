import { NextResponse } from 'next/server';
import { classifyWarnings, type AllocRow, type WarningItem } from '@/lib/academics/allocation-logic';

/**
 * local-sqlite branch — Phase 7 sub-effort 42, same §25a pattern as the
 * other allocations offline branches. `classifyWarnings` is pure/
 * client-safe already — reused unchanged, only the two SQL queries that
 * feed it needed a SQLite translation.
 */
async function db() {
  const { getSqliteDb } = await import('@/lib/repo/sqlite/singleton');
  return getSqliteDb();
}

export async function offlineWarnings(schoolId: number) {
  const sdb = await db();

  const rows = sdb.prepare(
    `SELECT cs.class_id, cs.subject_id, cs.allocation_role, cs.custom_initials, cs.teacher_id, cs.display_on_report,
            c.name AS class_name, sub.name AS subject_name,
            TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')) AS teacher_name
       FROM class_subjects cs
       JOIN classes c ON c.id = cs.class_id AND c.school_id = ?
       JOIN subjects sub ON sub.id = cs.subject_id
       LEFT JOIN staff st ON st.id = cs.teacher_id
       LEFT JOIN people p ON p.id = st.person_id
      WHERE (cs.valid_to IS NULL OR cs.valid_to > date('now')) AND (cs.status IS NULL OR cs.status='active')`
  ).all(schoolId) as any[];

  const names = new Map<string, { class_name: string; subject_name: string }>();
  for (const r of rows) names.set(`${r.class_id}__${r.subject_id}`, { class_name: r.class_name, subject_name: r.subject_name });
  const named = (w: WarningItem) => ({ ...w, ...(names.get(`${w.class_id}__${w.subject_id}`) ?? {}) });

  const w = classifyWarnings(rows as AllocRow[]);
  const no_primary = w.no_primary.map(named);
  const multiple_primary = w.multiple_primary.map(named);
  const missing_initials = w.missing_initials.map(named);

  const unallocated_graded = sdb.prepare(
    `SELECT DISTINCT cr.class_id, cr.subject_id, c.name AS class_name, sub.name AS subject_name
       FROM class_results cr
       JOIN classes c ON c.id = cr.class_id AND c.school_id = ?
       JOIN subjects sub ON sub.id = cr.subject_id
      WHERE NOT EXISTS (
        SELECT 1 FROM class_subjects cs WHERE cs.class_id = cr.class_id AND cs.subject_id = cr.subject_id
          AND (cs.valid_to IS NULL OR cs.valid_to > date('now')) AND (cs.status IS NULL OR cs.status='active'))
      LIMIT 200`
  ).all(schoolId) as any[];

  return NextResponse.json({
    success: true,
    summary: {
      no_primary: no_primary.length, multiple_primary: multiple_primary.length,
      missing_initials: missing_initials.length, unallocated_graded: unallocated_graded.length,
    },
    no_primary, multiple_primary, missing_initials, unallocated_graded,
  });
}
