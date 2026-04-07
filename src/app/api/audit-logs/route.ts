/**
 * GET /api/audit-logs
 * Returns paginated audit log entries for the caller's school.
 * Query params:
 *   page?    number (default 1)
 *   limit?   number (default 50, max 200)
 *   action?  string — filter by action name (partial match)
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
  const page   = Math.max(1, parseInt(searchParams.get('page')  ?? '1',  10));
  const limit  = Math.min(200, parseInt(searchParams.get('limit') ?? '50', 10));
  const action = searchParams.get('action')?.trim() || null;
  const offset = (page - 1) * limit;

  const whereClauses = ['al.school_id = ?'];
  const params: any[] = [session.schoolId];

  if (action) {
    whereClauses.push('al.action LIKE ?');
    params.push(`%${action}%`);
  }

  const where = whereClauses.join(' AND ');

  const [countRows, rows] = await Promise.all([
    query(`SELECT COUNT(*) AS total FROM audit_logs al WHERE ${where}`, params),
    query(
      `SELECT
         al.id,
         al.action,
         al.entity_type,
         al.entity_id,
         al.ip_address   AS ip,
         al.created_at,
         COALESCE(
           NULLIF(TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))), ''),
           u.email,
           'System'
         ) AS actor_name,
         COALESCE(al.details, al.new_values, al.old_values) AS changes
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE ${where}
       ORDER BY al.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    ),
  ]);

  const total = Number((countRows as any[])[0]?.total ?? 0);

  return NextResponse.json({
    success: true,
    data:    rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

