/** GET /api/control-center/audit — the Control Center's own audit trail. */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getControlSession } from '@/lib/control/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const rows = (await query(
    `SELECT a.id, a.action, a.resource, a.metadata, a.ip, a.created_at,
            u.name AS user_name, u.email AS user_email
       FROM control_audit_logs a LEFT JOIN control_users u ON u.id = a.user_id
      ORDER BY a.id DESC LIMIT 200`, [],
  )) as any[];
  return NextResponse.json({ success: true, rows });
}
