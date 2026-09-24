/**
 * Permission gate that tolerates DRAIS's current production RBAC state.
 *
 * Measured against production: the granular catalog codes (module.resource.action)
 * are held by ZERO roles; roles hold only coarse legacy codes (attendance.view,
 * attendance.manage, ...) and the school-admin role slug. Gating a new feature on
 * a granular code alone would lock every non-super-admin out, so a feature gate
 * accepts ANY of: a granular code, a named coarse code, or a named role slug.
 * Super-admins always pass. (Same reasoning as checkAnyPermission in rbac.ts.)
 */
import { userCan, userHasRole } from '@/lib/rbac';

export interface GateSession { userId: number; schoolId: number; isSuperAdmin: boolean }

export async function canAny(
  s: GateSession, codes: string[], roleSlugs: string[] = [],
): Promise<boolean> {
  if (s.isSuperAdmin) return true;
  for (const code of codes) {
    if (await userCan(s.userId, s.schoolId, code)) return true;
  }
  for (const slug of roleSlugs) {
    if (await userHasRole(s.userId, s.schoolId, slug)) return true;
  }
  return false;
}
