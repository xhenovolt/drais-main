/**
 * @drais/repo-contract — AttendanceRuleRepo interface.
 * Read-only — see ./types.ts's header on AttendanceRuleRecord. Mirrors
 * engine.ts's loadActiveRule() selection semantics (role eligibility +
 * boarding-scope specificity + priority), written fresh against the
 * schema per §25a's rule, not imported from that online file.
 */
import type { AttendanceRuleRecord } from './types';

export interface AttendanceRuleRepo {
  /** The one rule that would govern this role today — null means no
   *  active rule is configured at all for this school/role, which the
   *  caller must treat as "cannot evaluate," not a default-allow. */
  findActiveForRole(schoolId: number, roleType: 'student' | 'staff'): Promise<AttendanceRuleRecord | null>;
  /** Every active rule for the school, for provisioning/bulk reads — not
   *  exposed by findActiveForRole, which deliberately picks one winner
   *  per role rather than listing everything. */
  listActiveBySchool(schoolId: number): Promise<AttendanceRuleRecord[]>;
}
