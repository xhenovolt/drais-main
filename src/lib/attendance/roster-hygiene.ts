/**
 * Roster hygiene (Founder-Independence Phase C).
 *
 * The person-intelligence layer flags "never present → likely former/
 * unenrolled" people and the analytics are only as trustworthy as the roster.
 * Cleaning it used to require SQL/scripts. This makes it a safe, reversible,
 * audited admin action:
 *   • deactivate a set of people (status='inactive') — removes them from
 *     "active" rosters + absence expectations. Reversible via reactivate.
 *   • fix the student/enrollment mismatch — students who HAVE an active
 *     enrollment but a non-active status are genuinely current; activate them.
 *
 * validateHygieneAction() is PURE (unit-tested). Nothing here deletes; it only
 * flips `status`, which the reactivate path reverses.
 */
import { query } from '@/lib/db';

export type HygieneAction = 'deactivate' | 'reactivate' | 'fix_enrollment_mismatch' | 'count';

export interface HygienePlan { ok: boolean; reason?: string; role?: 'staff' | 'student'; personIds?: number[]; status?: string; }

/** PURE: validate a bulk action before it touches the DB. */
export function validateHygieneAction(input: {
  action: string; role?: string; personIds?: unknown;
}): HygienePlan {
  if (input.action === 'fix_enrollment_mismatch' || input.action === 'count') return { ok: true };
  if (!['deactivate', 'reactivate'].includes(input.action)) return { ok: false, reason: 'Unknown action' };
  const role = input.role === 'student' ? 'student' : input.role === 'staff' ? 'staff' : null;
  if (!role) return { ok: false, reason: "role must be 'staff' or 'student'" };
  const ids = Array.isArray(input.personIds) ? input.personIds.map(Number).filter(n => Number.isFinite(n) && n > 0) : [];
  if (!ids.length) return { ok: false, reason: 'Select at least one person' };
  if (ids.length > 1000) return { ok: false, reason: 'Too many at once (max 1000)' };
  return { ok: true, role, personIds: ids, status: input.action === 'deactivate' ? 'inactive' : 'active' };
}

/** Counts for the hygiene panel. */
export async function hygieneCounts(schoolId: number): Promise<{ enrollment_mismatch: number }> {
  const mm = (await query(
    `SELECT COUNT(DISTINCT s.id) n
       FROM students s JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
      WHERE s.school_id = ? AND s.deleted_at IS NULL AND (s.status <> 'active' OR s.status IS NULL)`,
    [schoolId],
  ).catch(() => [{ n: 0 }])) as any[];
  return { enrollment_mismatch: Number(mm[0]?.n || 0) };
}

/** Set status for a set of people (deactivate/reactivate). Returns rows changed. */
export async function setPeopleStatus(args: {
  schoolId: number; role: 'staff' | 'student'; personIds: number[]; status: string;
}): Promise<number> {
  const table = args.role === 'student' ? 'students' : 'staff';
  const ph = args.personIds.map(() => '?').join(',');
  const res = (await query(
    `UPDATE ${table} SET status = ?, updated_at = NOW()
      WHERE school_id = ? AND deleted_at IS NULL AND person_id IN (${ph})`,
    [args.status, args.schoolId, ...args.personIds],
  )) as any;
  return Number(res?.affectedRows || 0);
}

/** Activate students that have an active enrollment but a non-active status.
 *  (A student who is actively enrolled is, by definition, current.) */
export async function fixEnrollmentMismatch(schoolId: number): Promise<number> {
  const res = (await query(
    `UPDATE students s
        JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
        SET s.status = 'active', s.updated_at = NOW()
      WHERE s.school_id = ? AND s.deleted_at IS NULL AND (s.status <> 'active' OR s.status IS NULL)`,
    [schoolId],
  )) as any;
  return Number(res?.affectedRows || 0);
}
