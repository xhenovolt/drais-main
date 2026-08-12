/**
 * GET /api/admin/audit-logs — paginated audit trail for admins
 *
 * Full school-scoped log (not just CONTROL_ entries).
 * Supports filtering by: action, entity_type, user_id, date range.
 *
 * Permission: audit.read
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';
import { buildCsv, csvResponse } from '@/lib/export/serverCsv';
import { logAudit, AuditAction } from '@/lib/audit';

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  await requirePermission(session.userId, session.schoolId, 'audit.read', session.isSuperAdmin);

  const { searchParams } = new URL(req.url);
  const page       = Math.max(1, Number(searchParams.get('page')  ?? 1));
  const limit      = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50)));
  const action     = searchParams.get('action')      ?? null;
  const entityType = searchParams.get('entity_type') ?? null;
  const userId     = searchParams.get('user_id')     ?? null;
  const dateFrom   = searchParams.get('from')        ?? null;
  const dateTo     = searchParams.get('to')          ?? null;
  const offset     = (page - 1) * limit;

  const conditions: string[] = ['al.school_id = ?'];
  const values: any[]        = [session.schoolId];

  if (action)     { conditions.push('al.action = ?');         values.push(action); }
  if (entityType) { conditions.push('al.entity_type = ?');    values.push(entityType); }
  if (userId)     { conditions.push('al.user_id = ?');        values.push(Number(userId)); }
  if (dateFrom)   { conditions.push('al.created_at >= ?');    values.push(dateFrom); }
  if (dateTo)     { conditions.push('al.created_at <= ?');    values.push(dateTo + ' 23:59:59'); }

  const where = conditions.join(' AND ');

  // ── CSV export (P3): standardized, metadata-headed, and self-auditing ──────
  if (searchParams.get('format') === 'csv') {
    const exportRows = (await query(
      `SELECT al.created_at, al.action_type AS action, al.entity_type, al.entity_id, al.details,
              al.ip_address AS ip, al.source,
              CONCAT(u.first_name, ' ', u.last_name) AS actor_name, u.email AS actor_email
         FROM audit_logs al LEFT JOIN users u ON al.user_id = u.id
        WHERE ${where} ORDER BY al.created_at DESC LIMIT 50000`,
      values,
    )) as any[];
    const sch = (await query('SELECT name FROM schools WHERE id = ? LIMIT 1', [session.schoolId]).catch(() => [])) as any[];
    const me = (await query('SELECT CONCAT(first_name, " ", last_name) AS nm, email FROM users WHERE id = ? LIMIT 1', [session.userId]).catch(() => [])) as any[];
    const scope = [action && `action=${action}`, entityType && `entity=${entityType}`, dateFrom && `from=${dateFrom}`, dateTo && `to=${dateTo}`].filter(Boolean).join(', ') || 'all';
    const csv = buildCsv(
      [
        { key: 'created_at', label: 'When', value: (r: any) => r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at },
        { key: 'actor_name', label: 'Actor', value: (r: any) => r.actor_name?.trim() || r.actor_email || '' },
        { key: 'actor_email', label: 'Email' },
        { key: 'action', label: 'Action' },
        { key: 'entity_type', label: 'Entity' },
        { key: 'entity_id', label: 'Entity ID' },
        { key: 'details', label: 'Details', value: (r: any) => typeof r.details === 'string' ? r.details : JSON.stringify(r.details ?? '') },
        { key: 'ip', label: 'IP' },
        { key: 'source', label: 'Source' },
      ],
      exportRows,
      { title: 'DRAIS Audit Log Export', schoolName: sch[0]?.name ?? null, generatedBy: me[0]?.nm?.trim() || me[0]?.email || null, scope },
    );
    void logAudit({
      schoolId: session.schoolId, userId: session.userId, action: AuditAction.EXPORTED_AUDIT_LOGS,
      entityType: 'audit', details: { rows: exportRows.length, scope },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
      userAgent: req.headers.get('user-agent'),
    });
    return csvResponse(`audit-logs-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  const [countRows, rows] = await Promise.all([
    query(`SELECT COUNT(*) AS total FROM audit_logs al WHERE ${where}`, values),
    query(
      `SELECT
         al.id,
         al.action_type    AS action,
         al.entity_type,
         al.entity_id,
         al.details,
         al.ip_address     AS ip,
         al.source,
         al.created_at,
         al.user_id,
         CONCAT(u.first_name, ' ', u.last_name) AS actor_name,
         u.email AS actor_email
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE ${where}
       ORDER BY al.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`,
      values,
    ),
  ]);

  const total = Number((countRows as any[])[0]?.total ?? 0);

  return NextResponse.json({
    success: true,
    message: 'Audit logs loaded',
    data:       rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

/* ─────────────────────────────────────────────────────────────────────────────
 * DELETE — permanently remove audit entries.
 *
 * WHY THIS IS A HARD DELETE
 * Deleting audit history is never an accident. Someone doing it has decided
 * the entries are noise (half of this table is IMPORT_ROW_ERROR) or that a
 * retention limit has been reached. A soft delete would leave the rows in
 * place, growing the table it was meant to shrink, while creating the illusion
 * they were removed.
 *
 * THE PROBLEM A DELETE BUTTON CREATES, AND HOW IT IS CLOSED
 * If deleting audit entries were itself recorded in `audit_logs`, the first
 * thing anyone covering their tracks would do is delete that record too. So
 * the purge record is written to `audit_purges`, a separate append-only table
 * that THIS ENDPOINT CANNOT TARGET — it only ever deletes from `audit_logs`.
 * There is no route anywhere that deletes from `audit_purges`. The trail of
 * who deleted what therefore survives the deletion of everything else.
 *
 * A sample of the deleted rows is stored with the purge record, so a purge is
 * reviewable after the fact rather than being a bare count.
 *
 * WHO CAN DO IT
 * Super admins only, and a reason is required. This is intentionally stricter
 * than viewing: `audit.read` is granted to five roles, but destroying history
 * is not something a bursar or a director of studies should be able to do.
 * ────────────────────────────────────────────────────────────────────────── */

let _purgeSchema: Promise<void> | null = null;
function ensureAuditPurgeSchema(): Promise<void> {
  if (_purgeSchema) return _purgeSchema;
  _purgeSchema = query(
    `CREATE TABLE IF NOT EXISTS audit_purges (
       id            BIGINT PRIMARY KEY AUTO_INCREMENT,
       school_id     BIGINT NOT NULL,
       purged_by     BIGINT NULL,
       purged_by_email VARCHAR(255) NULL,
       reason        VARCHAR(500) NOT NULL,
       filter_json   JSON NULL,
       rows_deleted  INT NOT NULL DEFAULT 0,
       oldest_purged TIMESTAMP NULL,
       newest_purged TIMESTAMP NULL,
       sample_json   JSON NULL,
       ip            VARCHAR(64) NULL,
       created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       KEY idx_school_time (school_id, created_at)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, [],
  ).then(() => undefined).catch(() => undefined);
  return _purgeSchema;
}

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  if (!session.isSuperAdmin) {
    return NextResponse.json(
      { error: 'Only a super administrator can delete audit history.', code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const reason = String(body?.reason ?? '').trim();
  if (reason.length < 5) {
    return NextResponse.json(
      { error: 'A reason is required, and is recorded permanently.', code: 'REASON_REQUIRED' },
      { status: 400 },
    );
  }

  // Tenant scope is ALWAYS from the session — a super admin of one school must
  // never be able to purge another school's history.
  const conditions: string[] = ['school_id = ?'];
  const values: any[] = [session.schoolId];

  const ids: number[] = Array.isArray(body?.ids)
    ? body.ids.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n) && n > 0)
    : [];

  if (ids.length) {
    conditions.push(`id IN (${ids.map(() => '?').join(',')})`);
    values.push(...ids);
  } else {
    // Filter mode. `before` is mandatory here: without it an empty body would
    // mean "delete everything", which is too easy to do by accident for an
    // irreversible operation.
    const before = String(body?.before ?? '').trim();
    if (!before) {
      return NextResponse.json(
        { error: 'Provide either ids[] or a `before` date.', code: 'SCOPE_REQUIRED' },
        { status: 400 },
      );
    }
    conditions.push('created_at < ?');
    values.push(`${before} 00:00:00`);
    if (body?.action) { conditions.push('action = ?'); values.push(String(body.action)); }
  }
  const where = conditions.join(' AND ');

  // Read BEFORE deleting: the count, the range and a sample are the only
  // record that will survive, so they are captured while the rows still exist.
  const summary = (await query(
    `SELECT COUNT(*) AS n, MIN(created_at) AS oldest, MAX(created_at) AS newest
       FROM audit_logs WHERE ${where}`, values,
  ).catch(() => [])) as any[];
  const matched = Number(summary[0]?.n ?? 0);

  if (matched === 0) {
    return NextResponse.json({ success: true, deleted: 0, message: 'Nothing matched — nothing deleted.' });
  }

  const sample = (await query(
    `SELECT id, action, entity_type, entity_id, user_id, created_at
       FROM audit_logs WHERE ${where} ORDER BY created_at DESC LIMIT 20`, values,
  ).catch(() => [])) as any[];

  await ensureAuditPurgeSchema();
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip') || null;

  // The purge record is written FIRST. If the delete then fails, an
  // unexplained record is a far smaller problem than a silent deletion.
  await query(
    `INSERT INTO audit_purges
       (school_id, purged_by, purged_by_email, reason, filter_json,
        rows_deleted, oldest_purged, newest_purged, sample_json, ip)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      session.schoolId,
      session.userId ?? null,
      session.email ?? null,
      reason,
      JSON.stringify(ids.length ? { ids } : { before: body?.before ?? null, action: body?.action ?? null }),
      matched,
      summary[0]?.oldest ?? null,
      summary[0]?.newest ?? null,
      JSON.stringify(sample),
      ip,
    ],
  );

  const res = (await query(`DELETE FROM audit_logs WHERE ${where}`, values)) as any;
  const deleted = Number(res?.affectedRows ?? matched);

  // Also recorded in the ordinary trail — convenient, but NOT the safety net:
  // this row is itself deletable, which is exactly why audit_purges exists.
  void logAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: AuditAction.DELETED_AUDIT_LOGS, entityType: 'audit',
    details: { deleted, reason, scope: ids.length ? { ids: ids.length } : { before: body?.before, action: body?.action } },
    ip, userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json({
    success: true,
    deleted,
    message: `${deleted} audit ${deleted === 1 ? 'entry' : 'entries'} permanently deleted. This purge is recorded and cannot be removed.`,
  });
});
