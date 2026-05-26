/**
 * Default permission grants per canonical role slug.
 *
 * Used by:
 *   - the one-shot R4-prep migration that backfills existing roles
 *     whose legacy code grants were deactivated by the catalog sync
 *   - the future "create role from template" flow when admins make a
 *     new role and pick a starting profile (teacher, bursar, etc.)
 *
 * Codes may be either:
 *   - exact catalog codes (e.g. 'academics.results.view'), OR
 *   - wildcard ancestors (e.g. 'finance.*' to grant the entire module).
 * Wildcards are honoured at check time by expandPermissionChain.
 */

export type RoleSlug =
  | 'superadmin' | 'super_admin'
  | 'admin'
  | 'teacher'
  | 'bursar'
  | 'director_of_studies'
  | 'receptionist'
  | 'staff'
  | 'warden'
  | 'parent'
  | 'lab_attendant';

/**
 * Defaults are intentionally generous on the "view" side and narrower on
 * "manage". Schools refine these per role via the Roles & Permissions UI.
 */
export const ROLE_DEFAULTS: Record<RoleSlug, readonly string[]> = {
  // Super-admin slugs need no grants — `userCan` bypasses them via the
  // slug/flag defense in depth. Listed here for documentation.
  superadmin:  ['*'],
  super_admin: ['*'],

  // Admin = everything except the super-admin reserved 'roles.permission.sync'
  // and any future destructive-by-default codes. Wildcards make this
  // sustainable as the catalog grows.
  admin: [
    'academics.*',
    'learners.*',
    'staff.*',
    'roles.role.view', 'roles.role.create', 'roles.role.update', 'roles.role.archive', 'roles.role.assign',
    'roles.permission.view', 'roles.permission.assign',
    'departments.*',
    'attendance.*',
    'finance.*',
    'tahfiz.*',
    'drce.*',
    'trash.*',
    'system.audit.view',
    'system.sessions.view', 'system.sessions.terminate',
    'system.school.view', 'system.school.update',
    'system.modules.view', 'system.modules.manage',
    'system.settings.manage',
    'system.notifications.manage',
    'examinations.*',
    'inventory.*',
    'analytics.*',
    'intelligence.*',
    'notifications.*',
    'payroll.*',
  ],

  teacher: [
    'academics.secular.view',
    'academics.theology.view',
    'academics.classes.view',
    'academics.subjects.view',
    'academics.streams.view',
    'academics.terms.view',
    'academics.years.view',
    'academics.results.view', 'academics.results.enter',
    'academics.allocations.view',
    'academics.reports.view',
    'academics.snapshots.generate',
    'attendance.record.view', 'attendance.record.mark',
    'attendance.sessions.view',
    'learners.profile.view',
    'staff.profile.view', 'staff.workload.view',
    'tahfiz.records.view', 'tahfiz.records.manage',
  ],

  bursar: [
    'finance.*',
    'payroll.overview.view', 'payroll.payments.view', 'payroll.payslips.view',
    'learners.profile.view',
    'staff.profile.view',
    'system.school.view',
    'analytics.reports.view',
  ],

  director_of_studies: [
    'academics.*',
    'learners.profile.view', 'learners.profile.update',
    'learners.transfer.manage',
    'attendance.record.view', 'attendance.record.mark', 'attendance.record.bulk', 'attendance.record.export',
    'attendance.sessions.view', 'attendance.sessions.manage',
    'staff.profile.view', 'staff.workload.view',
    'departments.department.view',
    'system.school.view',
    'examinations.*',
    'analytics.overview.view', 'analytics.reports.view',
  ],

  receptionist: [
    'learners.profile.view', 'learners.profile.create', 'learners.profile.update',
    'learners.photos.manage', 'learners.documents.manage', 'learners.contacts.manage',
    'staff.profile.view',
    'attendance.record.view', 'attendance.record.mark',
    'system.school.view',
    'notifications.message.view', 'notifications.message.send',
  ],

  staff: [
    'staff.profile.view',
    'staff.employment.view',
    'staff.workload.view',
    'learners.profile.view',
    'academics.results.view',
    'attendance.record.view',
  ],

  warden: [
    'attendance.*',
    'learners.profile.view',
    'staff.profile.view',
    'notifications.message.view',
  ],

  parent: [
    // ABAC ownership filter (R6) will narrow this to the parent's own
    // children. Until then it is a "view any result" grant which mirrors
    // the legacy behaviour.
    'academics.results.view',
    'academics.reports.view',
    'learners.profile.view',
  ],

  lab_attendant: [
    'inventory.*',
    'learners.profile.view',
    'staff.profile.view',
  ],
};

export const KNOWN_ROLE_SLUGS = Object.keys(ROLE_DEFAULTS) as RoleSlug[];
