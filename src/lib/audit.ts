/**
 * src/lib/audit.ts
 * Centralized audit logging helper.
 * Uses the existing audit_log table — schema:
 *   (actor_user_id, action, entity_type, entity_id, changes_json, ip, user_agent)
 */

export interface AuditParams {
  user_id:    number | null;
  action:     string;
  entity_type?: string;
  target_id:  number | null;
  details:    Record<string, unknown>;
  req?:       { headers: { get(key: string): string | null } };
}

/**
 * Insert a row into audit_log.
 * @param conn  An active mysql2 connection (or pool connection)
 */
export async function logAudit(
  conn: { execute(sql: string, values?: unknown[]): Promise<unknown> },
  params: AuditParams,
): Promise<void> {
  try {
    const ip = params.req?.headers.get('x-forwarded-for')?.split(',')[0]
      ?? params.req?.headers.get('x-real-ip')
      ?? null;
    const ua = params.req?.headers.get('user-agent') ?? null;

    await conn.execute(
      `INSERT INTO audit_log
         (actor_user_id, action, entity_type, entity_id, changes_json, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        params.user_id,
        params.action,
        params.entity_type ?? 'unknown',
        params.target_id,
        JSON.stringify(params.details),
        ip,
        ua,
      ],
    );
  } catch (err) {
    // Audit failures must never crash the main request
    console.error('[audit] logAudit failed:', err);
  }
}
