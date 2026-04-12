/**
 * DRAIS — Central Audit Logger  (src/lib/audit.ts)
 * ─────────────────────────────────────────────────────────────────────────────
 * Writes to `audit_logs` (the authoritative table from enterprise_rbac_v1.sql).
 * Also maintains backward-compat shim for old callers using the `audit_log` table.
 *
 * Usage:
 *   import { logAudit, AuditAction, createAuditLogger } from '@/lib/audit';
 *
 *   await logAudit({
 *     schoolId:   session.schoolId,
 *     userId:     session.userId,
 *     action:     AuditAction.UPDATED_RESULTS,
 *     entityType: 'student',
 *     entityId:   studentId,
 *     details:    { subject: 'Math', old_score: 50, new_score: 80 },
 *     ip,
 *   });
 *
 * RULE: Audit failures NEVER crash the calling operation unless strict=true.
 */
import { query } from '@/lib/db';

// ─────────────────────────────────────────────────────────────────────────────
// Action name constants — use these everywhere for consistency
// ─────────────────────────────────────────────────────────────────────────────
export const AuditAction = {
  // Auth
  LOGIN:                    'LOGIN',
  LOGOUT:                   'LOGOUT',
  LOGIN_FAILED:             'LOGIN_FAILED',
  PASSWORD_CHANGED:         'PASSWORD_CHANGED',
  PASSWORD_RESET:           'PASSWORD_RESET',
  SESSION_TERMINATED:       'SESSION_TERMINATED',
  // Staff
  CREATED_STAFF:            'CREATED_STAFF',
  CREATED_STAFF_FAILED:     'CREATED_STAFF_FAILED',
  UPDATED_STAFF:            'UPDATED_STAFF',
  DELETED_STAFF:            'DELETED_STAFF',
  SUSPENDED_STAFF:          'SUSPENDED_STAFF',
  ACTIVATED_STAFF:          'ACTIVATED_STAFF',
  CREATED_STAFF_ACCOUNT:    'CREATED_STAFF_ACCOUNT',
  DISABLED_STAFF_ACCOUNT:   'DISABLED_STAFF_ACCOUNT',
  RESET_STAFF_PASSWORD:     'RESET_STAFF_PASSWORD',
  // Departments
  CREATED_DEPARTMENT:       'CREATED_DEPARTMENT',
  UPDATED_DEPARTMENT:       'UPDATED_DEPARTMENT',
  DELETED_DEPARTMENT:       'DELETED_DEPARTMENT',
  // Roles
  CREATED_ROLE:             'CREATED_ROLE',
  UPDATED_ROLE:             'UPDATED_ROLE',
  DELETED_ROLE:             'DELETED_ROLE',
  ASSIGNED_ROLE:            'ASSIGNED_ROLE',
  REMOVED_ROLE:             'REMOVED_ROLE',
  UPDATED_ROLE_PERMISSIONS: 'UPDATED_ROLE_PERMISSIONS',
  // Students
  ENROLLED_STUDENT:         'ENROLLED_STUDENT',
  PROMOTED_STUDENT:         'PROMOTED_STUDENT',
  REASSIGNED_CLASS:         'REASSIGNED_CLASS',
  BULK_IMPORT_STUDENTS:     'BULK_IMPORT_STUDENTS',
  MERGED_STUDENTS:          'MERGED_STUDENTS',
  // Results
  CREATED_RESULT:           'CREATED_RESULT',
  UPDATED_RESULTS:          'UPDATED_RESULTS',
  APPROVED_RESULTS:         'APPROVED_RESULTS',
  EXPORTED_RESULTS:         'EXPORTED_RESULTS',
  // School control (JETON)
  CONTROL_SUSPEND:          'CONTROL_SUSPEND',
  CONTROL_ACTIVATE:         'CONTROL_ACTIVATE',
  CONTROL_GET_SCHOOLS:      'CONTROL_GET_SCHOOLS',
  CONTROL_READ_AUDIT_LOGS:  'CONTROL_READ_AUDIT_LOGS',
} as const;

export type AuditActionType = typeof AuditAction[keyof typeof AuditAction];

export interface AuditEntry {
  schoolId:    number;
  userId:      number | null;
  action:      string;
  entityType?: string;
  entityId?:   number | string | null;
  details?:    Record<string, unknown>;
  ip?:         string | null;
  userAgent?:  string | null;
  source?:     'WEB' | 'MOBILE' | 'API' | 'JETON' | 'SYSTEM';
  /** If true, propagate DB errors instead of swallowing them */
  strict?:     boolean;
}

/**
 * Write an audit log entry to `audit_logs`.
 * Failures are silently logged unless strict=true.
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  const {
    schoolId,
    userId,
    action,
    entityType  = 'system',
    entityId    = null,
    details     = {},
    ip          = null,
    userAgent   = null,
    source      = 'WEB',
    strict      = false,
  } = entry;

  try {
    await query(
      `INSERT INTO audit_logs
         (school_id, user_id, action, action_type, entity_type, entity_id, details, ip_address, user_agent, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [schoolId, userId, action, action, entityType, entityId, JSON.stringify(details), ip, userAgent, source],
    );
  } catch (err) {
    const msg = `[Audit] Failed to write log — action=${action} school=${schoolId}`;
    if (strict) throw new Error(msg + ': ' + String(err));
    console.error(msg, err);
  }
}

/**
 * Create a bound logger for one request context.
 * All calls share the same school/user/ip/ua.
 */
export function createAuditLogger(ctx: {
  schoolId:   number;
  userId:     number | null;
  ip?:        string | null;
  userAgent?: string | null;
  source?:    AuditEntry['source'];
}) {
  return (
    action:      string,
    entityType?: string,
    entityId?:   number | string | null,
    details?:    Record<string, unknown>,
  ) => logAudit({ ...ctx, action, entityType, entityId, details });
}

// ─────────────────────────────────────────────────────────────────────────────
// Backward-compat shim for old callers passing a `conn` + AuditParams
// ─────────────────────────────────────────────────────────────────────────────
export interface AuditParams {
  user_id:      number | null;
  action:       string;
  entity_type?: string;
  target_id:    number | null;
  details:      Record<string, unknown>;
  req?:         { headers: { get(key: string): string | null } };
}

/** @deprecated  Use the new `logAudit(AuditEntry)` signature instead. */
export async function logAuditLegacy(
  _conn: unknown,
  params: AuditParams,
): Promise<void> {
  const ip = params.req?.headers.get('x-forwarded-for')?.split(',')[0]
    ?? params.req?.headers.get('x-real-ip')
    ?? null;
  const ua = params.req?.headers.get('user-agent') ?? null;

  // Route through new logger; schoolId = 0 (unknown in legacy context)
  await logAudit({
    schoolId:   0,
    userId:     params.user_id,
    action:     params.action,
    entityType: params.entity_type,
    entityId:   params.target_id,
    details:    params.details,
    ip,
    userAgent:  ua,
  });
}
