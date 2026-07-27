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
