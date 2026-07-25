/**
 * Attendance digest control (Phase D).
 *   GET                      → this school's digest mode + a live preview
 *   POST { mode }            → set digest mode (issues_only | daily | off)
 *   POST { action:'send' }   → send the digest now (admin-triggered, deduped)
 *
 * Robustness (auth + permission + try/catch + error envelope) via withRoute.
 */
import { withRoute } from '@/lib/api/with-route';
import { query } from '@/lib/db';
import { buildAttendanceDigest, sendDailyDigests } from '@/lib/attendance/digest';

export const runtime = 'nodejs';

const badRequest = (msg: string) => { const e: any = new Error(msg); e.statusCode = 400; return e; };

export const GET = withRoute(async ({ req, session }) => {
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

  return { success: true, mode, preview };
});

export const POST = withRoute({ permission: 'attendance.manage' }, async ({ session, body }) => {
  const b = await body();

  if (b?.action === 'send') {
    const res = await sendDailyDigests();
    return { success: true, ...res };
  }

  const mode = ['issues_only', 'daily', 'off'].includes(b?.mode) ? b.mode : null;
  if (!mode) throw badRequest('mode must be issues_only | daily | off');
  const existing = (await query(`SELECT id FROM school_settings WHERE school_id = ? AND key_name = 'attendance.digest_mode' LIMIT 1`, [session.schoolId])) as any[];
  if (existing[0]) await query(`UPDATE school_settings SET value_text = ? WHERE id = ?`, [mode, existing[0].id]);
  else await query(`INSERT INTO school_settings (school_id, key_name, value_text) VALUES (?, 'attendance.digest_mode', ?)`, [session.schoolId, mode]);
  return { success: true, mode };
});
