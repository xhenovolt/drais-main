/**
 * GET /api/audit-logs
 * Returns paginated audit log entries for the caller's school.
 * Query params:
 *   page?         number (default 1)
 *   limit?        number (default 50, max 200)
 *   action?       string  — filter by action name
 *   entity_type?  string  — filter by entity type
 *   entity_id?    number  — filter by entity id
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const page        = Math.max(1, Number(searchParams.get('page')  ?? 1));
  const limit       = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50)));
  const action      = searchParams.get('action')      ?? null;
  const entityType  = searchParams.get('entity_type') ?? null;
  const entityIdRaw = searchParams.get('entity_id');
  const entityId    = entityIdRaw ? Number(entityIdRaw) : null;

  const offset = (page - 1) * limit;

  let connection;
  try {
    connection = await getConnection();

    // Build dynamic WHERE clause — restrict to users of this school via actor_user_id
    const conditions: string[]  = [
      `al.actor_user_id IN (SELECT id FROM users WHERE school_id = ?)`,
    ];
    const values: any[] = [session.schoolId];

    if (action)     { conditions.push('al.action = ?');      values.push(action);     }
    if (entityType) { conditions.push('al.entity_type = ?'); values.push(entityType); }
    if (entityId)   { conditions.push('al.entity_id = ?');   values.push(entityId);   }

    const where = `WHERE ${conditions.join(' AND ')}`;

    const [countRows]: any = await connection.execute(
      `SELECT COUNT(*) AS total FROM audit_log al ${where}`,
      values,
    );
    const total = Number(countRows[0].total);

    const [rows]: any = await connection.execute(
      `SELECT al.id,
              al.actor_user_id,
              CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,'')) AS actor_name,
              al.action,
              al.entity_type,
              al.entity_id,
              al.changes_json,
              al.ip,
              al.user_agent,
              al.created_at
         FROM audit_log al
         LEFT JOIN users u ON u.id = al.actor_user_id
        ${where}
        ORDER BY al.id DESC
        LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    );

    // Parse changes_json safely
    const logs = rows.map((r: any) => ({
      ...r,
      changes: (() => { try { return JSON.parse(r.changes_json); } catch { return r.changes_json; } })(),
      changes_json: undefined,
    }));

    return NextResponse.json({
      success: true,
      data:    logs,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });

  } catch (error: any) {
    console.error('[audit-logs] error:', error);
    return NextResponse.json({
      success: false,
      error:   'Failed to fetch audit logs',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    }, { status: 500 });
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}
