import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { manualSendFromLog } from '@/lib/comm';

const num = (v: string | null, dflt: number, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  if (v == null) return dflt;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
};

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.dispatch.view', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const sp = req.nextUrl.searchParams;
  const status     = sp.get('status');
  const event_type = sp.get('event_type');
  const page       = num(sp.get('page'),      1,  1);
  const per_page   = num(sp.get('per_page'), 50,  1, 200);
  const offset     = (page - 1) * per_page;

  const where: string[] = ['school_id = ?'];
  const params: any[] = [session.schoolId];
  if (status)     { where.push('status = ?');     params.push(status); }
  if (event_type) { where.push('event_type = ?'); params.push(event_type); }

  const whereSql = `WHERE ${where.join(' AND ')}`;

  const rows = await query(
    `SELECT id, event_type, channel, recipient_phone, recipient_name,
            recipient_student_id, recipient_staff_id, message_body,
            status, provider, provider_message_id, provider_cost,
            error_message, retries, source, created_at, sent_at
       FROM comm_dispatch_log
       ${whereSql}
       ORDER BY id DESC
       LIMIT ${per_page} OFFSET ${offset}`,
    params,
  );

  const [{ total }] = (await query(
    `SELECT COUNT(*) AS total FROM comm_dispatch_log ${whereSql}`,
    params,
  )) as Array<{ total: number }>;

  // Status counts for the filter chips.
  const counts = await query(
    `SELECT status, COUNT(*) AS n
       FROM comm_dispatch_log
      WHERE school_id = ?
      GROUP BY status`,
    [session.schoolId],
  ) as Array<{ status: string; n: number }>;

  return NextResponse.json({
    success: true,
    data:    rows,
    total:   Number(total) || 0,
    page,
    per_page,
    counts,
  });
}

/**
 * POST { logId } — re-send a queued log entry now. Used by the
 * "Send Now" button when auto_mode was off or the row was awaiting
 * approval.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.dispatch.send', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const { logId } = await req.json().catch(() => ({}));
  if (!logId) return NextResponse.json({ error: 'logId required' }, { status: 400 });

  const result = await manualSendFromLog({
    logId:    Number(logId),
    schoolId: session.schoolId,
    userId:   session.userId,
  });
  if (!result.success) {
    return NextResponse.json({ success: false, error: result.error }, { status: 400 });
  }
  return NextResponse.json({ success: true });
}
