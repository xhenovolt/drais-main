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
       LIMIT ? OFFSET ?`,
      [...values, limit, offset],
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
