/**
 * Attendance digest control (Phase D).
 *   GET                      → this school's digest mode + a live preview
 *   POST { mode }            → set digest mode (issues_only | daily | off)
 *   POST { action:'send' }   → send the digest now (admin-triggered, deduped)
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { buildAttendanceDigest, sendDailyDigests } from '@/lib/attendance/digest';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const rows = (await query(
    `SELECT value_text FROM school_settings WHERE school_id = ? AND key_name = 'attendance.digest_mode' LIMIT 1`,
    [session.schoolId],
  ).catch(() => [])) as any[];
  const mode = ['daily', 'off', 'issues_only'].includes(rows[0]?.value_text) ? rows[0].value_text : 'issues_only';

  // Live preview using the same aggregation as the cron (best-effort).
  let preview = null;
  try {
    const r = await fetch(new URL('/api/attendance/intelligence-summary', req.url), { headers: { cookie: req.headers.get('cookie') || '' } });
    const s = await r.json();
    if (s?.success) preview = buildAttendanceDigest(s);
  } catch { /* preview optional */ }

  return NextResponse.json({ success: true, mode, preview });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'attendance.manage', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const b = await req.json().catch(() => null);

  if (b?.action === 'send') {
    const res = await sendDailyDigests();
    return NextResponse.json({ success: true, ...res });
  }

  const mode = ['issues_only', 'daily', 'off'].includes(b?.mode) ? b.mode : null;
  if (!mode) return NextResponse.json({ error: 'mode must be issues_only | daily | off' }, { status: 400 });
  const existing = (await query(`SELECT id FROM school_settings WHERE school_id = ? AND key_name = 'attendance.digest_mode' LIMIT 1`, [session.schoolId])) as any[];
  if (existing[0]) await query(`UPDATE school_settings SET value_text = ? WHERE id = ?`, [mode, existing[0].id]);
  else await query(`INSERT INTO school_settings (school_id, key_name, value_text) VALUES (?, 'attendance.digest_mode', ?)`, [session.schoolId, mode]);
  return NextResponse.json({ success: true, mode });
}
