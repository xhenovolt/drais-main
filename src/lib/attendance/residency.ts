/**
 * Day/boarding residency lookup — the missing piece behind
 * attendance_rules.boarding_scope, policy-resolver.ts and
 * rule-evaluator.ts, all of which already support day/boarding-scoped
 * rules but had nothing to read the person's actual status from (engine.ts
 * previously hardcoded personIsBoarding: undefined).
 *
 * Deliberately NOT derived from enrollments.study_mode_id -> study_modes.name
 * — that's per-ENROLLMENT (resets on re-enrollment/promotion) and free-text
 * (school-customisable name), so matching on it is fragile. students.
 * residency_status (migration 048) is the stable, explicit, per-student,
 * auditable source of truth the spec calls for instead.
 *
 * Boarding is a student-only concept here — staff never get a residency
 * status, so boarding_scope-restricted rules never apply to them (same as
 * before this module existed).
 */
import { query } from '@/lib/db';

export type ResidencyStatus = 'boarding' | 'day';

/**
 * Returns the student's residency status, or null for staff/visitors or if
 * no students row is found (e.g. a raw event resolved to a person who isn't
 * a student in this school). Never throws — a lookup failure must not block
 * attendance evaluation; it just falls back to the pre-existing behaviour
 * (only boarding_scope='all' rules match, nothing gated).
 */
export async function getResidencyStatus(
  schoolId: number,
  personId: number | null,
  roleType: 'student' | 'staff' | 'visitor' | null,
): Promise<ResidencyStatus | null> {
  if (roleType !== 'student' || !personId) return null;
  try {
    const rows = (await query(
      `SELECT residency_status
         FROM students
        WHERE person_id = ? AND school_id = ?
        LIMIT 1`,
      [personId, schoolId],
    )) as Array<{ residency_status: ResidencyStatus | null }>;
    return rows[0]?.residency_status ?? null;
  } catch {
    return null;
  }
}
