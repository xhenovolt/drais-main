/**
 * DRAIS Permission Catalog — single source of truth.
 *
 * Every permission DRAIS recognises is declared here. The sync engine
 * (`src/lib/rbac/sync.ts`) reconciles this catalog against the
 * `permissions` table:
 *   * Codes present here, missing in DB → INSERTed with is_active=1
 *   * Codes present in DB, missing here → marked is_active=0 (preserved
 *     for audit; UI hides them; userCan rejects them)
 *   * Description / module / resource / action drift → UPDATEd in place
 *
 * The `role_permissions` table is NEVER touched by sync. Assignments are
 * preserved across catalog evolution.
 *
 * Naming convention: `module.resource.action` (lowercase, snake_case
 * segments). Examples:
 *   academics.theology.view
 *   finance.payments.record
 *   trash.purge
 *
 * Wildcard support (handled by `authorize`):
 *   Granting `academics.theology.*` covers every code under that prefix.
 *   Granting `academics.*` covers the entire module.
 *   Granting `*` covers everything (super-admin only — do not grant otherwise).
 */

export interface PermissionDescriptor {
  module:      string;
  resource:    string;
  action:      string;
  description: string;
  /** Human-readable category for UI grouping. Defaults to module. */
  category?:   string;
}

/**
 * Helper: build a permission code from its segments. Type-safe — the
 * resulting key in PERMISSIONS will be exactly `${module}.${resource}.${action}`.
 */
const p = (
  module: string, resource: string, action: string, description: string, category?: string
): [string, PermissionDescriptor] => [
  `${module}.${resource}.${action}`,
  { module, resource, action, description, category: category ?? module },
];

const ENTRIES: Array<[string, PermissionDescriptor]> = [
  // ─── Academics ───────────────────────────────────────────────────────────
  p('academics', 'secular',     'view',     'View secular curriculum data, results, classes'),
  p('academics', 'secular',     'manage',   'Create / update secular records (classes, marks, allocations)'),
  p('academics', 'theology',    'view',     'View theology / Quran curriculum data'),
  p('academics', 'theology',    'manage',   'Create / update theology records'),
  p('academics', 'classes',     'view',     'View class roster'),
  p('academics', 'classes',     'manage',   'Create / update / archive classes'),
  p('academics', 'streams',     'view',     'View streams within classes'),
  p('academics', 'streams',     'manage',   'Create / update / archive streams'),
  p('academics', 'subjects',    'view',     'View subjects catalog'),
  p('academics', 'subjects',    'manage',   'Create / update / archive subjects'),
  p('academics', 'terms',       'view',     'View academic terms'),
  p('academics', 'terms',       'manage',   'Create / update / archive terms'),
  p('academics', 'years',       'view',     'View academic years'),
  p('academics', 'years',       'manage',   'Create / update / archive academic years'),
  p('academics', 'results',     'view',     'View student marks and results'),
  p('academics', 'results',     'enter',    'Enter / edit student marks'),
  p('academics', 'results',     'approve',  'Approve / publish results to parents'),
  p('academics', 'results',     'export',   'Export results to CSV / Excel'),
  p('academics', 'allocations', 'view',     'View teacher-subject-class allocations'),
  p('academics', 'allocations', 'manage',   'Assign teachers to subjects and classes'),
  p('academics', 'reports',     'view',     'View generated report cards'),
  p('academics', 'reports',     'generate', 'Generate new report-card snapshots'),
  p('academics', 'reports',     'publish',  'Publish report cards to parents'),
  p('academics', 'reports',     'delete',   'Permanently delete report cards'),
  p('academics', 'snapshots',   'generate', 'Trigger snapshot generation'),
  p('academics', 'snapshots',   'cancel',   'Cancel in-flight snapshot generation'),
  p('academics', 'snapshots',   'flush',    'Flush (delete) snapshot rows in bulk'),
  p('academics', 'snapshots',   'overrides','Manage per-report overrides'),
  p('academics', 'promotions',  'manage',   'Promote students across terms / years'),
  p('academics', 'curriculums', 'manage',   'Manage curriculum definitions'),

  // ─── Learners ─────────────────────────────────────────────────────────────
  p('learners', 'profile',      'view',     'View student profiles'),
  p('learners', 'profile',      'create',   'Enroll new students'),
  p('learners', 'profile',      'update',   'Edit student details'),
  p('learners', 'profile',      'archive',  'Soft-archive a learner'),
  p('learners', 'profile',      'restore',  'Restore archived learners'),
  p('learners', 'profile',      'merge',    'Merge duplicate learner records'),
  p('learners', 'photos',       'manage',   'Upload / replace learner photos'),
  p('learners', 'documents',    'manage',   'Manage learner documents and attachments'),
  p('learners', 'bulk',         'import',   'Bulk-import learners from CSV / Excel'),
  p('learners', 'transfer',     'manage',   'Reassign learners between classes'),
  p('learners', 'contacts',     'manage',   'Manage parent / guardian contacts'),
  p('learners', 'lifecycle',    'manage',   'Status transitions: admit / suspend / withdraw / graduate'),

  // ─── Staff & HR ───────────────────────────────────────────────────────────
  p('staff', 'profile',          'view',     'View staff profiles'),
  p('staff', 'profile',          'create',   'Add new staff'),
  p('staff', 'profile',          'update',   'Edit staff details'),
  p('staff', 'profile',          'archive',  'Archive staff (soft-delete)'),
  p('staff', 'account',          'manage',   'Create / disable staff user accounts'),
  p('staff', 'account',          'reset',    'Reset staff passwords'),
  p('staff', 'employment',       'view',     'View employment history'),
  p('staff', 'employment',       'manage',   'Record employment events (terminate, suspend, reactivate)'),
  p('staff', 'qualifications',   'manage',   'Add / remove staff qualifications'),
  p('staff', 'specializations',  'manage',   'Manage subject specialisations'),
  p('staff', 'positions',        'manage',   'Manage school positions catalog'),
  p('staff', 'workload',         'view',     'View teacher workload / assignments'),
  p('staff', 'hierarchy',        'manage',   'Manage reports-to relationships'),

  // ─── Roles & Permissions ──────────────────────────────────────────────────
  p('roles', 'role',          'view',     'View roles and their permissions'),
  p('roles', 'role',          'create',   'Create new roles'),
  p('roles', 'role',          'update',   'Edit role metadata'),
  p('roles', 'role',          'archive',  'Archive roles'),
  p('roles', 'role',          'assign',   'Assign or revoke roles on users'),
  p('roles', 'permission',    'view',     'View permission catalog'),
  p('roles', 'permission',    'assign',   'Grant or revoke permissions on a role'),
  p('roles', 'permission',    'sync',     'Run the permission catalog sync engine'),

  // ─── Departments ──────────────────────────────────────────────────────────
  p('departments', 'department', 'view',    'View departments'),
  p('departments', 'department', 'create',  'Create new departments'),
  p('departments', 'department', 'update',  'Edit departments'),
  p('departments', 'department', 'archive', 'Archive departments'),

  // ─── Attendance ───────────────────────────────────────────────────────────
  p('attendance', 'record',       'view',     'View attendance records'),
  p('attendance', 'record',       'mark',     'Mark attendance manually'),
  p('attendance', 'record',       'bulk',     'Bulk-mark attendance'),
  p('attendance', 'record',       'export',   'Export attendance reports'),
  p('attendance', 'devices',      'view',     'View biometric / fingerprint devices'),
  p('attendance', 'devices',      'manage',   'Configure biometric devices'),
  p('attendance', 'sessions',     'view',     'View attendance sessions'),
  p('attendance', 'sessions',     'manage',   'Create / close attendance sessions'),
  p('attendance', 'enrollment',   'manage',   'Enroll users on biometric devices'),
  p('attendance', 'reconcile',    'run',      'Reconcile attendance data'),

  // ─── Finance ──────────────────────────────────────────────────────────────
  p('finance', 'overview',     'view',     'View financial dashboard'),
  p('finance', 'fees',         'view',     'View fee structures'),
  p('finance', 'fees',         'manage',   'Create / update fee structures'),
  p('finance', 'payments',     'view',     'View payments ledger'),
  p('finance', 'payments',     'record',   'Record new payments'),
  p('finance', 'payments',     'refund',   'Process refunds'),
  p('finance', 'invoices',     'view',     'View invoices'),
  p('finance', 'invoices',     'create',   'Create invoices'),
  p('finance', 'invoices',     'approve',  'Approve invoices'),
  p('finance', 'expenditures', 'view',     'View expenditures'),
  p('finance', 'expenditures', 'record',   'Record expenditures'),
  p('finance', 'expenditures', 'approve',  'Approve expenditures'),
  p('finance', 'waivers',      'manage',   'Grant / revoke fee waivers and discounts'),
  p('finance', 'ledger',       'view',     'View accounting ledger'),
  p('finance', 'reports',      'view',     'View financial reports'),
  p('finance', 'reports',      'export',   'Export financial reports'),

  // ─── Payroll ──────────────────────────────────────────────────────────────
  p('payroll', 'overview',  'view',     'View payroll dashboard'),
  p('payroll', 'salaries',  'view',     'View salary definitions'),
  p('payroll', 'salaries',  'manage',   'Manage salary definitions'),
  p('payroll', 'payments',  'view',     'View payroll payment history'),
  p('payroll', 'payments',  'process',  'Process payroll runs'),
  p('payroll', 'payslips',  'view',     'View / generate payslips'),

  // ─── Tahfiz ───────────────────────────────────────────────────────────────
  p('tahfiz', 'overview',    'view',     'View Tahfiz overview'),
  p('tahfiz', 'records',     'view',     'View Tahfiz progress records'),
  p('tahfiz', 'records',     'manage',   'Record / edit Tahfiz progress'),
  p('tahfiz', 'books',       'view',     'View Tahfiz books catalog'),
  p('tahfiz', 'books',       'manage',   'Manage Tahfiz books'),
  p('tahfiz', 'portions',    'manage',   'Manage Quran portions'),
  p('tahfiz', 'groups',      'manage',   'Manage memorisation groups'),
  p('tahfiz', 'plans',       'manage',   'Manage memorisation plans'),
  p('tahfiz', 'results',     'view',     'View Tahfiz results'),
  p('tahfiz', 'reports',     'view',     'View Tahfiz reports'),

  // ─── DRCE ─────────────────────────────────────────────────────────────────
  p('drce', 'templates', 'view',     'View DRCE report templates'),
  p('drce', 'templates', 'create',   'Create new DRCE templates'),
  p('drce', 'templates', 'edit',     'Edit DRCE templates'),
  p('drce', 'templates', 'publish',  'Publish DRCE templates'),
  p('drce', 'templates', 'delete',   'Delete DRCE templates'),
  p('drce', 'registry',  'manage',   'Manage DRCE template registry'),

  // ─── Trash ────────────────────────────────────────────────────────────────
  p('trash', 'view',         'access',  'Open the trash interface'),
  p('trash', 'archive',      'execute', 'Soft-archive any registered entity'),
  p('trash', 'restore',      'execute', 'Restore archived entities'),
  p('trash', 'purge',        'execute', 'Permanently delete archived entities (destructive)'),

  // ─── System Admin ─────────────────────────────────────────────────────────
  p('system', 'audit',        'view',     'Read audit logs'),
  p('system', 'sessions',     'view',     'View active user sessions'),
  p('system', 'sessions',     'terminate','Force-terminate user sessions'),
  p('system', 'school',       'view',     'View school configuration'),
  p('system', 'school',       'update',   'Edit school configuration'),
  p('system', 'modules',      'view',     'View enabled school modules'),
  p('system', 'modules',      'manage',   'Enable / disable school modules'),
  p('system', 'settings',     'manage',   'Manage system-level settings'),
  p('system', 'notifications','manage',   'Configure notification channels'),
  p('system', 'feature_flags','manage',   'Manage feature flags'),

  // ─── Inventory ────────────────────────────────────────────────────────────
  p('inventory', 'stock',  'view',    'View inventory stock'),
  p('inventory', 'stock',  'manage',  'Manage inventory stock'),
  p('inventory', 'orders', 'manage',  'Manage inventory orders'),

  // ─── Examinations ─────────────────────────────────────────────────────────
  p('examinations', 'exam',      'view',    'View exams'),
  p('examinations', 'exam',      'manage',  'Create / update / archive exams'),
  p('examinations', 'deadlines', 'view',    'View exam deadlines'),
  p('examinations', 'deadlines', 'manage',  'Manage exam deadlines'),
  p('examinations', 'grading',   'manage',  'Manage grading scales'),
  p('examinations', 'results',   'lock',    'Lock results after publication'),

  // ─── Analytics & Intelligence ─────────────────────────────────────────────
  p('analytics',    'overview',   'view',    'View analytics dashboards'),
  p('analytics',    'reports',    'view',    'View analytic reports'),
  p('intelligence', 'overview',   'view',    'View AI intelligence dashboards'),
  p('intelligence', 'reports',    'view',    'View AI-driven reports'),

  // ─── Notifications ────────────────────────────────────────────────────────
  p('notifications', 'message',  'view',     'View notifications'),
  p('notifications', 'message',  'send',     'Send notifications to staff / parents'),
  p('notifications', 'channels', 'manage',   'Configure SMS / email / push channels'),
];

/** Type-safe permission catalog. */
export const PERMISSIONS: Readonly<Record<string, PermissionDescriptor>> =
  Object.freeze(Object.fromEntries(ENTRIES));

/** Union type of every catalogued permission code. */
export type PermissionCode = keyof typeof PERMISSIONS;

/** All catalogued codes, sorted for stable iteration. */
export const ALL_PERMISSION_CODES: readonly string[] =
  Object.keys(PERMISSIONS).sort();

/**
 * Group permissions for the tree UI:
 *   { academics: { secular: ['view','manage'], theology: ['view','manage'], ... }, ... }
 */
export function buildPermissionTree(): Record<string, Record<string, string[]>> {
  const tree: Record<string, Record<string, string[]>> = {};
  for (const [code, d] of Object.entries(PERMISSIONS)) {
    (tree[d.module] ??= {});
    (tree[d.module][d.resource] ??= []).push(code);
  }
  // Sort actions within each resource for stable rendering
  for (const mod of Object.values(tree)) {
    for (const codes of Object.values(mod)) codes.sort();
  }
  return tree;
}

/**
 * Expand a requested permission code into the chain of codes that grant it:
 *   'academics.theology.view' →
 *     ['academics.theology.view', 'academics.theology.*', 'academics.*', '*']
 *
 * Used by `authorize` to honour wildcard grants.
 */
export function expandPermissionChain(code: string): string[] {
  const parts = code.split('.');
  const chain: string[] = [code];
  for (let i = parts.length - 1; i > 0; i--) {
    chain.push(parts.slice(0, i).join('.') + '.*');
  }
  chain.push('*');
  return chain;
}
