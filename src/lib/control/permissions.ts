/**
 * Control Center — role → permission catalog (Phase 13 / E-4).
 *
 * Replaces the binary `canManage` (super-admin-only) gate with least-privilege
 * roles so support/ops helpers can be delegated safely:
 *   • SUPER_ADMIN — everything (platform owner).
 *   • OPERATOR    — day-to-day ops (schools, devices, plan assignment,
 *                   impersonation) but NOT the catalog, operators, or destructive
 *                   permanent deletes.
 *   • VIEWER      — read-only.
 *
 * `controlCan` is PURE and unit-tested. Reads are open to any authenticated
 * control session; only mutations are permission-gated.
 */
export type ControlRoleName = 'XHENVOLT_SUPER_ADMIN' | 'XHENVOLT_OPERATOR' | 'XHENVOLT_VIEWER';

export const CONTROL_PERMISSIONS = {
  'platform.view':      'View the platform (schools, devices, health, audit, plans)',
  'schools.manage':     'Change a school (status, modules, subscription, plan, archive/soft-delete/restore)',
  'schools.hard_delete':'Permanently delete a school and all its data',
  'devices.manage':     'Assign / release / suspend / retire devices',
  'plans.catalog':      'Create / edit / delete subscription plans',
  'impersonate':        'Start and revoke school impersonations',
  'operators.manage':   'Create and manage Control Center operators',
} as const;
export type ControlPermission = keyof typeof CONTROL_PERMISSIONS;

const ALL = Object.keys(CONTROL_PERMISSIONS) as ControlPermission[];

const ROLE_PERMISSIONS: Record<ControlRoleName, ControlPermission[]> = {
  XHENVOLT_SUPER_ADMIN: ALL,
  XHENVOLT_OPERATOR: ['platform.view', 'schools.manage', 'devices.manage', 'impersonate'],
  XHENVOLT_VIEWER: ['platform.view'],
};

/** PURE: may this control role perform this permission? Unknown role → no. */
export function controlCan(role: string | null | undefined, permission: ControlPermission): boolean {
  const perms = ROLE_PERMISSIONS[(role || '') as ControlRoleName];
  return !!perms && perms.includes(permission);
}

/** The permissions a role holds (for surfacing in the UI). */
export function permissionsFor(role: string | null | undefined): ControlPermission[] {
  return ROLE_PERMISSIONS[(role || '') as ControlRoleName] ?? [];
}
