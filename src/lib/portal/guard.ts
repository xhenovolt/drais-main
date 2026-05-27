/**
 * THE ISOLATION GATE.
 *
 * Architectural invariant for the entire parent portal:
 *   A parent can only ever see learners whose student_id is in their OWN
 *   active link set, scoped to the active school. Every data query intersects
 *   (requested) ∩ (authorized) — never the requested set alone.
 *
 * Code-review rule: no portal route may query students / results /
 * daily_attendance / fee_payments / etc. without going through
 * authorizedStudentIds() or assertCanViewStudent(), or embedding the
 * studentGateSubquery() in its SQL.
 */
import { query } from '@/lib/db';

export class PortalForbiddenError extends Error {
  constructor(msg = 'Forbidden') { super(msg); this.name = 'PortalForbiddenError'; }
}
export class PortalNoSchoolContextError extends Error {
  constructor(msg = 'No active school selected') { super(msg); this.name = 'PortalNoSchoolContextError'; }
}

/** The active student_ids a parent may see in a given school. Empty = sees nothing. */
export async function authorizedStudentIds(
  parentAccountId: number,
  schoolId: number,
): Promise<number[]> {
  const rows = (await query(
    `SELECT student_id
       FROM parent_student_links
      WHERE parent_account_id = ?
        AND school_id = ?
        AND status = 'active'`,
    [parentAccountId, schoolId],
  )) as Array<{ student_id: number }>;
  return rows.map(r => Number(r.student_id));
}

/**
 * Throw PortalForbiddenError unless the requested student is in the parent's
 * active link set for the active school. Call this at the top of any
 * single-learner route.
 */
export async function assertCanViewStudent(
  parentAccountId: number,
  schoolId: number | null,
  studentId: number,
): Promise<void> {
  if (schoolId == null) throw new PortalNoSchoolContextError();
  const rows = (await query(
    `SELECT 1
       FROM parent_student_links
      WHERE parent_account_id = ?
        AND school_id = ?
        AND student_id = ?
        AND status = 'active'
      LIMIT 1`,
    [parentAccountId, schoolId, studentId],
  )) as any[];
  if (!rows.length) throw new PortalForbiddenError();
}

/**
 * Reusable SQL fragment + params for embedding the gate inside a larger query.
 * Usage:
 *   const gate = studentGateSubquery('r.student_id', parentId, schoolId);
 *   query(`SELECT ... WHERE ${gate.sql} AND ...`, [...gate.params, ...rest])
 *
 * Produces:  r.student_id IN (SELECT student_id FROM parent_student_links
 *                              WHERE parent_account_id=? AND school_id=? AND status='active')
 */
export function studentGateSubquery(
  studentIdColumn: string,
  parentAccountId: number,
  schoolId: number,
): { sql: string; params: any[] } {
  return {
    sql: `${studentIdColumn} IN (
            SELECT student_id FROM parent_student_links
             WHERE parent_account_id = ? AND school_id = ? AND status = 'active'
          )`,
    params: [parentAccountId, schoolId],
  };
}

/** Schools (with active links) this parent belongs to — drives the school picker. */
export async function parentSchools(parentAccountId: number): Promise<Array<{
  school_id: number; school_name: string; learner_count: number;
}>> {
  const rows = (await query(
    `SELECT psl.school_id,
            sc.name AS school_name,
            COUNT(DISTINCT psl.student_id) AS learner_count
       FROM parent_student_links psl
       JOIN schools sc ON sc.id = psl.school_id AND sc.deleted_at IS NULL
      WHERE psl.parent_account_id = ?
        AND psl.status = 'active'
      GROUP BY psl.school_id, sc.name
      ORDER BY sc.name ASC`,
    [parentAccountId],
  )) as any[];
  return rows.map(r => ({
    school_id:     Number(r.school_id),
    school_name:   r.school_name,
    learner_count: Number(r.learner_count),
  }));
}

/** Validate that a parent actually has an active link in a school (used by the school switcher). */
export async function parentHasSchool(parentAccountId: number, schoolId: number): Promise<boolean> {
  const rows = (await query(
    `SELECT 1 FROM parent_student_links
      WHERE parent_account_id = ? AND school_id = ? AND status = 'active' LIMIT 1`,
    [parentAccountId, schoolId],
  )) as any[];
  return rows.length > 0;
}
