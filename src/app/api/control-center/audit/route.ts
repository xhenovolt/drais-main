/** GET /api/control-center/audit — the Control Center's own audit trail.
 *  Paginated + searchable (P21) so the FULL history is browsable, not just the
 *  most recent 200 entries. */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getControlSession } from '@/lib/control/auth';
import { parsePageParams, totalPages } from '@/lib/control/pagination';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const { page, limit, offset } = parsePageParams(sp.get('page'), sp.get('limit'), { defaultLimit: 50, maxLimit: 200 });
  const q = (sp.get('q') || '').trim().toLowerCase();
  const action = (sp.get('action') || '').trim();

  const conditions: string[] = [];
  const params: any[] = [];
  if (q) {
    conditions.push('(LOWER(a.action) LIKE ? OR LOWER(a.resource) LIKE ? OR LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR LOWER(a.ip) LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }
  if (action) { conditions.push('a.action = ?'); params.push(action); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countRows = (await query(
    `SELECT COUNT(*) AS total FROM control_audit_logs a LEFT JOIN control_users u ON u.id = a.user_id ${where}`,
    params,
  )) as any[];
  const total = Number(countRows[0]?.total || 0);

  const rows = (await query(
    `SELECT a.id, a.action, a.resource, a.metadata, a.ip, a.created_at,
            u.name AS user_name, u.email AS user_email
       FROM control_audit_logs a LEFT JOIN control_users u ON u.id = a.user_id
       ${where}
      ORDER BY a.id DESC
      LIMIT ${limit} OFFSET ${offset}`,
    params,
  )) as any[];

  return NextResponse.json({
    success: true,
    rows,
    pagination: { page, limit, total, totalPages: totalPages(total, limit) },
  });
}
