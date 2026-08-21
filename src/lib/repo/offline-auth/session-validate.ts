/**
 * @drais/repo — offline session validation.
 *
 * The offline counterpart to src/lib/auth.ts's getSessionSchoolId() — same
 * checks, same shape, against local data instead of a live query. This is
 * the piece that makes a session created by attemptOfflineLogin()
 * (login.ts) actually usable on the NEXT request, not just at the moment
 * of login.
 *
 * A real gap caught while building this, fixed before this file was
 * written on top of it: UserRoleRepo.listByUser() required an exact
 * school_id match, but the real online super-admin check
 * (src/lib/auth.ts:75-79) treats a NULL user_roles.school_id as a
 * platform-wide grant (`ur.school_id = s.school_id OR ur.school_id IS
 * NULL`) — a plain `=` would silently miss it. Fixed in both engines
 * (mysql/sqlite user-role-repo.ts) rather than replicated incorrectly
 * here.
 *
 * Same status/subscription enforcement as online's getSessionSchoolId —
 * checked on EVERY validated session, not only at login time: a school
 * that goes suspended, or a carried subscription snapshot that lapses,
 * between logins must still lock a session out on its next use, exactly
 * matching online's own "checked on every protected request" behavior.
 *
 * Lands inert — nothing calls this yet, same as login.ts.
 */
import type { SqliteConnection } from '../sqlite/connection';
import type { Repos } from '../contract';
import type { SessionInfo } from '@/lib/auth';
import { findActiveOfflineSession } from './session';
import { evaluateOfflineSubscriptionAccess } from './subscription';

/** True if a role counts as super-admin — mirrors src/lib/auth.ts's own
 *  EXISTS check exactly (is_super_admin flag, OR slug, OR trimmed name),
 *  minus the impersonated_by_control_user OR-clause, which is an
 *  online-only Control-Center concept with no offline equivalent
 *  (schema.ts's sessions table header already notes this). */
function isSuperAdminRole(role: { isActive: boolean | null; isSuperAdmin: boolean | null; slug: string | null; name: string }): boolean {
  if (!role.isActive) return false;
  if (role.isSuperAdmin) return true;
  const slug = (role.slug ?? '').toLowerCase();
  if (slug === 'super_admin') return true;
  const name = role.name.trim().toLowerCase();
  return name === 'super admin' || name === 'superadmin';
}

export async function validateOfflineSession(db: SqliteConnection, repos: Repos, sessionToken: string, now: Date = new Date()): Promise<SessionInfo | null> {
  const session = findActiveOfflineSession(db, sessionToken, now);
  if (!session || session.schoolId == null) return null;

  const user = await repos.users.findById(session.schoolId, session.userId);
  if (!user || user.deletedAt) return null;

  const school = await repos.schools.findById(session.schoolId);
  if (!school || school.deletedAt) return null;
  if (school.status === 'suspended' || school.status === 'inactive') return null;
  if (!evaluateOfflineSubscriptionAccess(school, now).hasAccess) return null;

  const staff = user.personId != null ? await repos.staff.findByPersonId(session.schoolId, user.personId) : null;

  const userRoles = await repos.userRoles.listByUser(session.schoolId, user.id);
  let isSuperAdmin = false;
  for (const ur of userRoles) {
    const role = await repos.roles.findById(session.schoolId, ur.roleId);
    if (role && isSuperAdminRole(role)) { isSuperAdmin = true; break; }
  }

  // Best-effort activity bump, mirrors online's own fire-and-forget UPDATE.
  db.prepare(`UPDATE sessions SET last_activity_at = ? WHERE id = ?`).run(now.toISOString(), session.id);

  return {
    userId: user.id,
    schoolId: session.schoolId,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    isSuperAdmin,
    staffId: staff?.id ?? null,
    mustChangePassword: user.mustChangePassword,
  };
}
