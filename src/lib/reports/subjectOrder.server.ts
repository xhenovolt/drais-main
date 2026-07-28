/**
 * Server-only CRUD for subject_report_order. Kept separate from
 * subjectOrder.ts (the pure resolver) so that module stays free of
 * mysql2/'@/lib/db' imports and safe to use from client code (e.g. a live
 * preview in the admin UI), matching the reportComments.ts /
 * reportComments.server.ts split already used elsewhere in DRCE.
 */
import { query } from '@/lib/db';
import type { SubjectOrderRule } from './subjectOrder';

interface Row {
  id: number;
  school_id: number;
  subject_id: number;
  class_id: number | null;
  result_type_id: number | null;
  priority: number;
}

function toRule(r: Row): SubjectOrderRule & { id: number } {
  return {
    id: r.id,
    subjectId: Number(r.subject_id),
    classId: r.class_id == null ? null : Number(r.class_id),
    resultTypeId: r.result_type_id == null ? null : Number(r.result_type_id),
    priority: Number(r.priority),
  };
}

/** All ordering rules for a school — used by snapshot generation (best-effort). */
export async function listSubjectOrderRules(schoolId: number): Promise<SubjectOrderRule[]> {
  const rows = (await query(
    `SELECT id, school_id, subject_id, class_id, result_type_id, priority
       FROM subject_report_order WHERE school_id = ?`,
    [schoolId],
  ).catch(() => [])) as Row[];
  return rows.map(toRule);
}

/** Same as above, but including each row's id + subject name, for the admin UI. */
export async function listSubjectOrderRulesWithNames(schoolId: number): Promise<Array<SubjectOrderRule & { id: number; subjectName: string }>> {
  const rows = (await query(
    `SELECT o.id, o.school_id, o.subject_id, o.class_id, o.result_type_id, o.priority, s.name AS subject_name
       FROM subject_report_order o
       JOIN subjects s ON s.id = o.subject_id
      WHERE o.school_id = ?
      ORDER BY o.class_id IS NULL, o.class_id, o.result_type_id IS NULL, o.result_type_id, o.priority`,
    [schoolId],
  ).catch(() => [])) as Array<Row & { subject_name: string }>;
  return rows.map((r) => ({ ...toRule(r), subjectName: r.subject_name }));
}

/**
 * Upsert one subject's priority for a (schoolId, classId, resultTypeId)
 * scope. NULL-safe: the unique key can't rely on SQL uniqueness with
 * NULLable columns (NULL <> NULL), so we check-then-write explicitly.
 */
export async function setSubjectOrder(
  schoolId: number, subjectId: number, classId: number | null, resultTypeId: number | null,
  priority: number, userId?: number | null,
): Promise<void> {
  const existing = (await query(
    `SELECT id FROM subject_report_order
      WHERE school_id = ? AND subject_id = ?
        AND class_id ${classId == null ? 'IS NULL' : '= ?'}
        AND result_type_id ${resultTypeId == null ? 'IS NULL' : '= ?'}
      LIMIT 1`,
    [schoolId, subjectId, ...(classId == null ? [] : [classId]), ...(resultTypeId == null ? [] : [resultTypeId])],
  )) as any[];
  if (existing.length) {
    await query(`UPDATE subject_report_order SET priority = ? WHERE id = ?`, [priority, existing[0].id]);
  } else {
    await query(
      `INSERT INTO subject_report_order (school_id, subject_id, class_id, result_type_id, priority, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [schoolId, subjectId, classId, resultTypeId, priority, userId ?? null],
    );
  }
}

/** Bulk reorder — accepts a full ordered subject-id list for one scope and
 *  writes sequential priorities (10, 20, 30, ...) in one pass. This is what
 *  a drag-to-reorder admin UI calls after each drop. */
export async function setSubjectOrderBulk(
  schoolId: number, orderedSubjectIds: number[], classId: number | null, resultTypeId: number | null,
  userId?: number | null,
): Promise<void> {
  for (let i = 0; i < orderedSubjectIds.length; i++) {
    await setSubjectOrder(schoolId, orderedSubjectIds[i], classId, resultTypeId, (i + 1) * 10, userId);
  }
}

export async function deleteSubjectOrderRule(schoolId: number, id: number): Promise<void> {
  await query(`DELETE FROM subject_report_order WHERE id = ? AND school_id = ?`, [id, schoolId]);
}
