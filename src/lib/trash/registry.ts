/**
 * Phase 1 — Universal trash entity registry.
 *
 * Single source of truth for what is archivable / restorable / purgeable
 * via the admin trash UI. Adding a new entity = one descriptor below.
 *
 * The trash service (src/lib/trash/service.ts) and the trash API
 * (/api/admin/trash) consume this registry — no per-entity bespoke
 * routes, no duplicated SQL.
 */

/**
 * A foreign-key reference from another table to this entity. Used to
 * compute dependency previews before a purge ("deleting this learner
 * will affect 14 reports, 3 attendance records").
 *
 * `blocking: true` means the API rejects the purge until those rows are
 * cleared. Most dependencies are non-blocking — they're informational.
 */
export interface DependencyRule {
  tableName:    string;
  fkColumn:     string;
  label:        string;
  blocking?:    boolean;
}

export interface EntityDescriptor {
  /** URL-safe code used as the API parameter (`?entity=student`). */
  code:            string;
  /** Display label used in the trash UI tab and table. */
  label:           string;
  pluralLabel:     string;
  /** Physical table. */
  tableName:       string;
  /** Primary-key column. Defaults to `id`. */
  primaryKey:      string;
  /**
   * Column that scopes to a school. NULL means the entity is global
   * (very rare; e.g. positions catalog). Most entities have school_id.
   */
  schoolIdColumn:  string | null;
  /**
   * SELECT clause that yields the display columns shown in the trash UI
   * (label, subtitle, etc). MUST also include `id`, `deleted_at`,
   * `deleted_by`, `delete_reason`, `restored_at`.
   * Joins are expressed in `displayJoins` so callers can intersperse
   * WHERE clauses cleanly.
   */
  displaySelect:   string;
  /** JOIN clauses needed to compute the display label. */
  displayJoins?:   string;
  /**
   * Generates the WHERE-clause fragment + params for free-text search.
   * Receives the search term; returns an `{ sql, params }` pair that the
   * service splices into its query.
   */
  searchPredicate?: (term: string) => { sql: string; params: unknown[] };
  /** Optional cascade tables to also archive when this entity is archived. */
  dependencies:    DependencyRule[];
  /** Permission codes used by the trash service for this entity. */
  permissions: {
    archive: string;
    restore: string;
    purge:   string;
  };
}

/**
 * Default permission codes — overridden per entity only when ops policy
 * needs finer control.
 */
const DEFAULT_PERMS = {
  archive: 'trash.archive',
  restore: 'trash.restore',
  purge:   'trash.purge',
} as const;

export const ENTITY_REGISTRY: readonly EntityDescriptor[] = [
  {
    code:           'student',
    label:          'Learner',
    pluralLabel:    'Learners',
    tableName:      'students',
    primaryKey:     'id',
    schoolIdColumn: 'school_id',
    displaySelect: `
      e.id,
      CONCAT_WS(' ', p.first_name, p.last_name) AS label,
      e.admission_no AS subtitle,
      e.deleted_at, e.deleted_by, e.delete_reason, e.restored_at, e.restored_by
    `,
    displayJoins: 'LEFT JOIN people p ON p.id = e.person_id',
    searchPredicate: (term) => ({
      sql: '(p.first_name LIKE ? OR p.last_name LIKE ? OR e.admission_no LIKE ?)',
      params: [`%${term}%`, `%${term}%`, `%${term}%`],
    }),
    dependencies: [
      { tableName: 'enrollments',   fkColumn: 'student_id', label: 'enrollment records' },
      { tableName: 'class_results', fkColumn: 'student_id', label: 'result records' },
      { tableName: 'promotions',    fkColumn: 'student_id', label: 'promotion records' },
    ],
    permissions: DEFAULT_PERMS,
  },
  {
    code:           'staff',
    label:          'Staff member',
    pluralLabel:    'Staff',
    tableName:      'staff',
    primaryKey:     'id',
    schoolIdColumn: 'school_id',
    displaySelect: `
      e.id,
      CONCAT_WS(' ', p.first_name, p.last_name) AS label,
      COALESCE(pos.name, e.position) AS subtitle,
      e.deleted_at, e.deleted_by, e.delete_reason, e.restored_at, e.restored_by
    `,
    displayJoins: `
      LEFT JOIN people p     ON p.id   = e.person_id
      LEFT JOIN positions pos ON pos.id = e.position_id
    `,
    searchPredicate: (term) => ({
      sql: '(p.first_name LIKE ? OR p.last_name LIKE ? OR e.staff_no LIKE ?)',
      params: [`%${term}%`, `%${term}%`, `%${term}%`],
    }),
    dependencies: [
      { tableName: 'class_teachers',   fkColumn: 'staff_id', label: 'class-teacher assignments' },
      { tableName: 'staff_employment', fkColumn: 'staff_id', label: 'employment events' },
      { tableName: 'class_subjects',   fkColumn: 'teacher_id', label: 'subject allocations' },
    ],
    permissions: DEFAULT_PERMS,
  },
  {
    code:           'class',
    label:          'Class',
    pluralLabel:    'Classes',
    tableName:      'classes',
    primaryKey:     'id',
    schoolIdColumn: 'school_id',
    displaySelect: `
      e.id, e.name AS label, NULL AS subtitle,
      e.deleted_at, e.deleted_by, e.delete_reason, e.restored_at, e.restored_by
    `,
    searchPredicate: (term) => ({
      sql: 'e.name LIKE ?',
      params: [`%${term}%`],
    }),
    dependencies: [
      { tableName: 'enrollments',    fkColumn: 'class_id', label: 'enrollments' },
      { tableName: 'class_subjects', fkColumn: 'class_id', label: 'subject allocations' },
      { tableName: 'class_results',  fkColumn: 'class_id', label: 'result records' },
      { tableName: 'streams',        fkColumn: 'class_id', label: 'streams' },
    ],
    permissions: DEFAULT_PERMS,
  },
  {
    code:           'stream',
    label:          'Stream',
    pluralLabel:    'Streams',
    tableName:      'streams',
    primaryKey:     'id',
    schoolIdColumn: 'school_id',
    displaySelect: `
      e.id, e.name AS label,
      (SELECT c.name FROM classes c WHERE c.id = e.class_id) AS subtitle,
      e.deleted_at, e.deleted_by, e.delete_reason, e.restored_at, e.restored_by
    `,
    searchPredicate: (term) => ({
      sql: 'e.name LIKE ?',
      params: [`%${term}%`],
    }),
    dependencies: [
      { tableName: 'enrollments', fkColumn: 'stream_id', label: 'enrollments' },
    ],
    permissions: DEFAULT_PERMS,
  },
  {
    code:           'subject',
    label:          'Subject',
    pluralLabel:    'Subjects',
    tableName:      'subjects',
    primaryKey:     'id',
    schoolIdColumn: 'school_id',
    displaySelect: `
      e.id, e.name AS label, e.code AS subtitle,
      e.deleted_at, e.deleted_by, e.delete_reason, e.restored_at, e.restored_by
    `,
    searchPredicate: (term) => ({
      sql: '(e.name LIKE ? OR e.code LIKE ?)',
      params: [`%${term}%`, `%${term}%`],
    }),
    dependencies: [
      { tableName: 'class_subjects', fkColumn: 'subject_id', label: 'class allocations' },
      { tableName: 'class_results',  fkColumn: 'subject_id', label: 'result records' },
    ],
    permissions: DEFAULT_PERMS,
  },
  {
    code:           'department',
    label:          'Department',
    pluralLabel:    'Departments',
    tableName:      'departments',
    primaryKey:     'id',
    schoolIdColumn: 'school_id',
    displaySelect: `
      e.id, e.name AS label, e.description AS subtitle,
      e.deleted_at, e.deleted_by, e.delete_reason, e.restored_at, e.restored_by
    `,
    searchPredicate: (term) => ({
      sql: 'e.name LIKE ?',
      params: [`%${term}%`],
    }),
    dependencies: [
      { tableName: 'staff', fkColumn: 'department_id', label: 'staff members' },
    ],
    permissions: DEFAULT_PERMS,
  },
  {
    code:           'term',
    label:          'Term',
    pluralLabel:    'Terms',
    tableName:      'terms',
    primaryKey:     'id',
    schoolIdColumn: 'school_id',
    displaySelect: `
      e.id, e.name AS label,
      CONCAT(e.start_date, ' → ', e.end_date) AS subtitle,
      e.deleted_at, e.deleted_by, e.delete_reason, e.restored_at, e.restored_by
    `,
    searchPredicate: (term) => ({
      sql: 'e.name LIKE ?',
      params: [`%${term}%`],
    }),
    dependencies: [
      { tableName: 'class_results',   fkColumn: 'term_id', label: 'result records' },
      { tableName: 'class_teachers',  fkColumn: 'term_id', label: 'class-teacher assignments' },
      { tableName: 'report_snapshots',fkColumn: 'term_id', label: 'report snapshots' },
    ],
    permissions: DEFAULT_PERMS,
  },
  {
    code:           'academic_year',
    label:          'Academic year',
    pluralLabel:    'Academic years',
    tableName:      'academic_years',
    primaryKey:     'id',
    schoolIdColumn: 'school_id',
    displaySelect: `
      e.id, e.name AS label, e.status AS subtitle,
      e.deleted_at, e.deleted_by, e.delete_reason, e.restored_at, e.restored_by
    `,
    searchPredicate: (term) => ({
      sql: 'e.name LIKE ?',
      params: [`%${term}%`],
    }),
    dependencies: [
      { tableName: 'terms', fkColumn: 'academic_year_id', label: 'terms' },
    ],
    permissions: DEFAULT_PERMS,
  },
  {
    code:           'result_type',
    label:          'Result type',
    pluralLabel:    'Result types',
    tableName:      'result_types',
    primaryKey:     'id',
    schoolIdColumn: 'school_id',
    displaySelect: `
      e.id, e.name AS label, NULL AS subtitle,
      e.deleted_at, e.deleted_by, e.delete_reason, e.restored_at, e.restored_by
    `,
    searchPredicate: (term) => ({
      sql: 'e.name LIKE ?',
      params: [`%${term}%`],
    }),
    dependencies: [
      { tableName: 'class_results',    fkColumn: 'result_type_id', label: 'result records' },
      { tableName: 'report_snapshots', fkColumn: 'result_type_id', label: 'report snapshots' },
    ],
    permissions: DEFAULT_PERMS,
  },
  {
    code:           'exam',
    label:          'Exam',
    pluralLabel:    'Exams',
    tableName:      'exams',
    primaryKey:     'id',
    schoolIdColumn: 'school_id',
    displaySelect: `
      e.id, e.name AS label, e.exam_date AS subtitle,
      e.deleted_at, e.deleted_by, e.delete_reason, e.restored_at, e.restored_by
    `,
    searchPredicate: (term) => ({
      sql: 'e.name LIKE ?',
      params: [`%${term}%`],
    }),
    dependencies: [],
    permissions: DEFAULT_PERMS,
  },
  {
    code:           'role',
    label:          'Role',
    pluralLabel:    'Roles',
    tableName:      'roles',
    primaryKey:     'id',
    schoolIdColumn: 'school_id',
    displaySelect: `
      e.id, e.name AS label, e.slug AS subtitle,
      e.deleted_at, e.deleted_by, e.delete_reason, e.restored_at, e.restored_by
    `,
    searchPredicate: (term) => ({
      sql: '(e.name LIKE ? OR e.slug LIKE ?)',
      params: [`%${term}%`, `%${term}%`],
    }),
    dependencies: [
      { tableName: 'user_roles',       fkColumn: 'role_id', label: 'user assignments' },
      { tableName: 'role_permissions', fkColumn: 'role_id', label: 'permission grants' },
    ],
    permissions: DEFAULT_PERMS,
  },
  {
    code:           'user',
    label:          'User account',
    pluralLabel:    'User accounts',
    tableName:      'users',
    primaryKey:     'id',
    schoolIdColumn: 'school_id',
    displaySelect: `
      e.id, e.email AS label,
      CONCAT_WS(' ', e.first_name, e.last_name) AS subtitle,
      e.deleted_at, e.deleted_by, e.delete_reason, e.restored_at, e.restored_by
    `,
    searchPredicate: (term) => ({
      sql: '(e.email LIKE ? OR e.first_name LIKE ? OR e.last_name LIKE ?)',
      params: [`%${term}%`, `%${term}%`, `%${term}%`],
    }),
    dependencies: [
      { tableName: 'user_roles', fkColumn: 'user_id', label: 'role assignments' },
      { tableName: 'sessions',   fkColumn: 'user_id', label: 'active sessions' },
    ],
    permissions: DEFAULT_PERMS,
  },
] as const;

const REGISTRY_BY_CODE: Record<string, EntityDescriptor> = Object.fromEntries(
  ENTITY_REGISTRY.map(d => [d.code, d]),
);

export function getEntityDescriptor(code: string): EntityDescriptor | null {
  return REGISTRY_BY_CODE[code] ?? null;
}

export function listEntityDescriptors(): readonly EntityDescriptor[] {
  return ENTITY_REGISTRY;
}

export function isEntityCode(v: unknown): v is string {
  return typeof v === 'string' && v in REGISTRY_BY_CODE;
}
