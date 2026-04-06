/**
 * GET  /api/relay-commands/drain  → count pending+sent commands for this school
 * POST /api/relay-commands/drain  → cancel all pending+sent commands for this school
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const rows = await query(
    `SELECT COUNT(*) AS cnt
     FROM relay_commands rc
     JOIN devices d ON d.sn = rc.device_sn
     WHERE rc.status IN ('pending', 'sent')
       AND d.school_id = ?`,
    [session.schoolId],
  );

  return NextResponse.json({ count: Number((rows as any)?.[0]?.cnt ?? 0) });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const result = await query(
    `UPDATE relay_commands rc
     JOIN devices d ON d.sn = rc.device_sn
     SET rc.status = 'cancelled', rc.completed_at = NOW(),
         rc.error_message = 'Manually cancelled (queue drain)'
     WHERE rc.status IN ('pending', 'sent')
       AND d.school_id = ?`,
    [session.schoolId],
  );

  const affected = (result as any)?.affectedRows ?? 0;

  return NextResponse.json({ success: true, cancelled: affected });
}
