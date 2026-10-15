/**
 * Control Center — access control catalog.
 *
 * Every screen of the Control Center is an AREA, and every area has its own
 * actions (view / create / edit / delete, plus a few specific ones such as
 * impersonate or activate). A permission is `<area>.<action>`.
 *
 * Who holds what:
 *   • XHENVOLT_SUPER_ADMIN — everything, always. Cannot be restricted, so the
 *     platform owner can never lock themselves out.
 *   • Everyone else — the explicit permission list stored on their operator
 *     record (control_users.permissions), chosen in Control Center →
 *     Operators. Operators created before per-person permissions existed
 *     have no list yet and keep their role's preset until one is saved.
 *
 * Reads are permission-gated exactly like writes: an operator without
 * `<area>.view` cannot load that area's data, not just its menu link.
 *
 * `controlCan` is PURE and unit-tested.
 */
export type ControlRoleName = 'XHENVOLT_SUPER_ADMIN' | 'XHENVOLT_OPERATOR' | 'XHENVOLT_VIEWER';

export interface ControlArea {
  key: string;
  label: string;
  group: string;
  description: string;
  /** Control Center pages that belong to this area (prefix match). */
  pages: string[];
  /** action → what it allows. `view` is always first. */
  actions: Record<string, string>;
}

export const CONTROL_AREAS: ControlArea[] = [
  { key: 'dashboard', label: 'Dashboard', group: 'Overview', pages: ['/control/dashboard'],
    description: 'Platform overview: totals, alerts and recent activity.',
    actions: { view: 'See the dashboard and platform alerts' } },

  { key: 'schools', label: 'Schools', group: 'Schools', pages: ['/control/schools'],
    description: 'School records, modules, subscriptions and lifecycle.',
    actions: {
      view: 'See schools and their details',
      create: 'Provision (create) new schools',
      edit: 'Change status, modules, plan and subscription',
      delete: 'Archive, soft-delete and restore schools',
      hard_delete: 'Permanently delete a school and ALL its data',
      export: 'Download a full data export of a school',
      impersonate: 'Sign in to a school as its administrator',
    } },
  { key: 'accounts', label: 'Account Locks', group: 'Schools', pages: ['/control/user-locks'],
    description: 'School user accounts that are locked out of DRAIS.',
    actions: { view: 'See locked school accounts', edit: 'Unlock school accounts' } },
  { key: 'devices', label: 'Devices', group: 'Schools', pages: ['/control/devices'],
    description: 'Biometric devices and which school they belong to.',
    actions: { view: 'See devices and their status', edit: 'Assign, release, suspend and retire devices' } },
  { key: 'plans', label: 'Plans', group: 'Schools', pages: ['/control/plans'],
    description: 'The subscription plan catalog.',
    actions: { view: 'See plans', create: 'Create plans', edit: 'Edit plans', delete: 'Delete plans' } },
  { key: 'billing', label: 'Billing', group: 'Schools', pages: [],
    description: 'Invoices, payments and SMS credit top-ups for schools.',
    actions: { view: 'See invoices and payments', edit: 'Generate invoices, record payments and top up SMS credit' } },
  { key: 'id_cards', label: 'ID Card Watermark', group: 'Schools', pages: ['/control/id-cards'],
    description: 'The platform watermark printed on school ID cards.',
    actions: { view: 'See the watermark settings', edit: 'Change the watermark' } },

  { key: 'sms', label: 'SMS', group: 'Messaging', pages: ['/control/sms'],
    description: 'Platform SMS overview and school SMS balances.',
    actions: {
      view: 'See SMS usage and school balances',
      test: 'Send test SMS',
      send: 'Compose and send SMS to any numbers',
      limits: 'Change how many test and composed SMS operators may send',
    } },
  { key: 'sms_accounting', label: 'SMS Accounting', group: 'Messaging', pages: ['/control/sms/accounting'],
    description: 'SMS spend, revenue and margins.',
    actions: { view: 'See SMS accounting' } },
  { key: 'sms_providers', label: 'SMS Providers', group: 'Messaging', pages: ['/control/sms/providers'],
    description: 'The SMS gateways DRAIS sends through and their credentials.',
    actions: {
      view: 'See providers, status and balance',
      create: 'Add a provider',
      edit: 'Change a provider\'s settings and API keys',
      delete: 'Delete a disabled provider',
      activate: 'Switch the platform to a provider',
      test: 'Send a test through a provider',
    } },
  { key: 'sms_routing', label: 'School SMS Routing', group: 'Messaging', pages: ['/control/sms/routing'],
    description: 'Which provider and account each school sends through.',
    actions: { view: 'See school SMS routes', edit: 'Change school SMS routes' } },
  { key: 'sms_pricing', label: 'SMS Pricing & Top-ups', group: 'Messaging', pages: ['/control/sms/pricing'],
    description: 'What schools pay per SMS and their top-up history.',
    actions: { view: 'See prices and top-ups', edit: 'Change prices and record top-ups' } },
  { key: 'comm', label: 'Comms', group: 'Messaging', pages: ['/control/comm'],
    description: 'Cross-channel message delivery oversight (WhatsApp and others).',
    actions: { view: 'See message delivery across schools' } },

  { key: 'bi', label: 'Business', group: 'Monitoring', pages: ['/control/bi'],
    description: 'Revenue, growth and churn figures.',
    actions: { view: 'See business figures' } },
  { key: 'system_health', label: 'System Health', group: 'Monitoring', pages: ['/control/system-health'],
    description: 'Infrastructure health, background jobs and maintenance mode.',
    actions: { view: 'See system health and jobs', manage: 'Run jobs and switch maintenance mode' } },
  { key: 'sentinel', label: 'Sentinel', group: 'Monitoring', pages: ['/control/sentinel'],
    description: 'Incident detection and alerting.',
    actions: {
      view: 'See incidents and diagnoses',
      manage: 'Acknowledge, resolve and suppress incidents; run a diagnosis',
      configure: 'Change the alert phone number and send test alerts',
    } },

  { key: 'operators', label: 'Operators', group: 'Access & security', pages: ['/control/operators'],
    description: 'Control Center users and what each of them may do.',
    actions: {
      view: 'See operators and their permissions',
      create: 'Add operators',
      edit: 'Change operators\' permissions, status and passwords',
      delete: 'Remove operators',
    } },
  { key: 'audit', label: 'Audit Log', group: 'Access & security', pages: ['/control/audit'],
    description: 'Who did what in the Control Center.',
    actions: { view: 'See the audit log' } },
  { key: 'database', label: 'Database Access', group: 'Access & security', pages: ['/control/database-settings'],
    description: 'The passkey that opens school database settings.',
    actions: { view: 'Open database access', edit: 'Change the database access passkey' } },
  { key: 'backup', label: 'Backups', group: 'Access & security', pages: ['/control/backup'],
    description: 'Full platform backups.',
    actions: { view: 'See backup history', create: 'Start backups', download: 'Download backups', delete: 'Delete backups' } },

  { key: 'docs', label: 'Docs', group: 'Help', pages: ['/control/docs'],
    description: 'Internal engineering documentation.',
    actions: { view: 'Read the documentation' } },
];

/** Every permission, `<area>.<action>` → description. */
export const CONTROL_PERMISSIONS: Record<string, string> = Object.fromEntries(
  CONTROL_AREAS.flatMap((a) => Object.entries(a.actions).map(([act, d]) => [`${a.key}.${act}`, d])),
);
export type ControlPermission = string;
export const ALL_PERMISSIONS = Object.keys(CONTROL_PERMISSIONS);

/** Permissions no one but a super admin may hold — destructive or platform-wide. */
export const SUPER_ADMIN_ONLY: string[] = ['schools.hard_delete', 'sms.limits'];

/** Permission names from before per-area permissions, still accepted by controlCan. */
const LEGACY: Record<string, string> = {
  'platform.view': 'dashboard.view',
  'schools.manage': 'schools.edit',
  'devices.manage': 'devices.edit',
  'plans.catalog': 'plans.edit',
  'billing.manage': 'billing.edit',
  'impersonate': 'schools.impersonate',
  'operators.manage': 'operators.edit',
  'sentinel.manage': 'sentinel.manage',
  'sms.test': 'sms.test',
  'sms.provider.view': 'sms_providers.view',
  'sms.provider.create': 'sms_providers.create',
  'sms.provider.update': 'sms_providers.edit',
  'sms.provider.delete': 'sms_providers.delete',
  'sms.provider.activate': 'sms_providers.activate',
  'sms.provider.test': 'sms_providers.test',
  'sms.balance.view': 'sms_accounting.view',
  'sms.route.view': 'sms_routing.view',
  'sms.route.manage': 'sms_routing.edit',
};

const views = (...keys: string[]) => keys.map((k) => `${k}.view`);

/** Ready-made permission sets the Operators screen offers as starting points. */
export const CONTROL_PRESETS: Record<string, { label: string; description: string; permissions: string[] }> = {
  viewer: {
    label: 'Viewer',
    description: 'Read-only: schools, devices and messaging status. Changes nothing.',
    permissions: views('dashboard', 'schools', 'devices', 'plans', 'sms', 'sms_providers', 'sms_routing', 'docs'),
  },
  support: {
    label: 'School support',
    description: 'Helps schools: sees schools and devices, unlocks accounts, can sign in as a school.',
    permissions: [...views('dashboard', 'schools', 'accounts', 'devices', 'sms', 'docs'), 'accounts.edit', 'devices.edit', 'schools.impersonate'],
  },
  finance: {
    label: 'Finance',
    description: 'Billing, SMS pricing, top-ups and business figures.',
    permissions: [...views('dashboard', 'schools', 'plans', 'billing', 'sms', 'sms_accounting', 'sms_pricing', 'bi'), 'billing.edit', 'sms_pricing.edit'],
  },
  messaging: {
    label: 'Messaging operations',
    description: 'Watches SMS delivery and routes; cannot touch provider keys.',
    permissions: [...views('dashboard', 'schools', 'sms', 'sms_accounting', 'sms_providers', 'sms_routing', 'comm', 'sentinel'), 'sms.test', 'sms_providers.test', 'sms_routing.edit'],
  },
  operator: {
    label: 'Operator (previous default)',
    description: 'Everything the old Operator role could do — most areas, including SMS provider keys.',
    permissions: [], // filled below from the role
  },
};

const OPERATOR_LEGACY: string[] = [
  // Reads used to be open to every signed-in operator.
  ...CONTROL_AREAS.filter((a) => !['operators', 'database', 'backup'].includes(a.key)).map((a) => `${a.key}.view`),
  'operators.view',
  'schools.create', 'schools.edit', 'schools.delete', 'schools.impersonate',
  'accounts.edit', 'devices.edit', 'billing.edit', 'id_cards.edit',
  'sentinel.manage', 'sms.test',
  'sms_providers.create', 'sms_providers.edit', 'sms_providers.delete', 'sms_providers.activate', 'sms_providers.test',
  'sms_routing.edit', 'sms_pricing.edit',
];
CONTROL_PRESETS.operator.permissions = OPERATOR_LEGACY;

const VIEWER_LEGACY: string[] = [
  ...CONTROL_AREAS.filter((a) => !['operators', 'database', 'backup'].includes(a.key)).map((a) => `${a.key}.view`),
  'operators.view',
];

const ROLE_DEFAULTS: Record<ControlRoleName, string[]> = {
  XHENVOLT_SUPER_ADMIN: ALL_PERMISSIONS,
  XHENVOLT_OPERATOR: OPERATOR_LEGACY,
  XHENVOLT_VIEWER: VIEWER_LEGACY,
};

/** Who is asking: a role name, or an operator with their own permission list. */
export type ControlSubject = string | null | undefined | { role?: string | null; permissions?: string[] | null; schoolScope?: number[] | null };

/**
 * Areas whose screens mix every school together (totals, platform logs, provider keys,
 * other operators). An operator limited to some schools never holds these: the data
 * cannot be filtered to their schools, so they would see the whole platform.
 */
export const PLATFORM_WIDE_AREAS = ['dashboard', 'bi', 'system_health', 'sentinel', 'comm', 'sms', 'sms_accounting', 'sms_providers', 'sms_routing', 'sms_pricing', 'audit', 'backup', 'database', 'operators', 'plans'];
const dropPlatformWide = (list: string[]) => list.filter((p) => !PLATFORM_WIDE_AREAS.includes(p.split('.')[0]));

/** Only known permission names, de-duplicated, never super-admin-only ones. */
export function sanitizePermissions(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const known = new Set(ALL_PERMISSIONS);
  return [...new Set(list.map(String))].filter((p) => known.has(p) && !SUPER_ADMIN_ONLY.includes(p)).sort();
}

/** PURE: the permissions a subject holds. Unknown role and no list → none. */
export function permissionsFor(subject: ControlSubject): string[] {
  const role = typeof subject === 'object' && subject ? subject.role : subject;
  if (role === 'XHENVOLT_SUPER_ADMIN') return ALL_PERMISSIONS;
  if (typeof subject === 'object' && subject && Array.isArray(subject.permissions)) {
    const own = sanitizePermissions(subject.permissions);
    // Holding any action in an area implies seeing it.
    for (const p of [...own]) { const v = `${p.split('.')[0]}.view`; if (!own.includes(v) && CONTROL_PERMISSIONS[v]) own.push(v); }
    return subject.schoolScope ? dropPlatformWide(own) : own;
  }
  const preset = ROLE_DEFAULTS[(role || '') as ControlRoleName] ?? [];
  return typeof subject === 'object' && subject?.schoolScope ? dropPlatformWide(preset) : preset;
}

/** PURE: may this subject perform this permission? Legacy names are accepted. */
export function controlCan(subject: ControlSubject, permission: ControlPermission): boolean {
  const p = LEGACY[permission] ?? permission;
  return permissionsFor(subject).includes(p);
}

/** The area a Control Center path belongs to (longest page prefix wins). */
export function areaForPath(pathname: string): ControlArea | null {
  let best: ControlArea | null = null; let len = -1;
  for (const a of CONTROL_AREAS) for (const p of a.pages) {
    if ((pathname === p || pathname.startsWith(`${p}/`)) && p.length > len) { best = a; len = p.length; }
  }
  return best;
}

/** PURE: may this subject open this Control Center page? Pages outside every area (own sessions) are open. */
export function canOpenPath(subject: ControlSubject, pathname: string): boolean {
  const a = areaForPath(pathname);
  return !a || controlCan(subject, `${a.key}.view`);
}
