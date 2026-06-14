/**
 * GET/PUT /api/attendance/live-settings
 *
 * Per-school live-popup configuration (attendance_live_ui_settings).
 * GET returns the school's settings (defaults if none saved). PUT
 * upserts. Consumed by the global live listener to decide whether and
 * how to show the popup.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

const DEFAULTS = {
  live_popup_enabled: 1, show_for_students: 1, show_for_staff: 1, show_for_unknown: 1,
  show_for_late_only: 0, show_sms_status: 1, show_guardian_phone: 0, show_fee_balance: 0,
  sound_enabled: 1, popup_duration_ms: 5000, mount_scope: 'attendance',
};

const BOOL_KEYS = [
  'live_popup_enabled', 'show_for_students', 'show_for_staff', 'show_for_unknown',
  'show_for_late_only', 'show_sms_status', 'show_guardian_phone', 'show_fee_balance', 'sound_enabled',
] as const;

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const rows = (await query(
      `SELECT * FROM attendance_live_ui_settings WHERE school_id = ? LIMIT 1`,
      [session.schoolId],
    )) as any[];
    const s = rows[0] ?? { school_id: session.schoolId, ...DEFAULTS };
    return NextResponse.json({ success: true, settings: s });
  } catch (err) {
    console.error('[live-settings GET]', err);
    return NextResponse.json({ success: true, settings: { school_id: session.schoolId, ...DEFAULTS } });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const v = { ...DEFAULTS };
  for (const k of BOOL_KEYS) if (k in body) (v as any)[k] = body[k] ? 1 : 0;
  if ('popup_duration_ms' in body) {
    const d = Number(body.popup_duration_ms);
    v.popup_duration_ms = [0, 3000, 5000, 10000].includes(d) ? d : 5000;
  }
  if ('mount_scope' in body && ['global', 'attendance', 'students'].includes(body.mount_scope)) {
    v.mount_scope = body.mount_scope;
  }

  try {
    await query(
      `INSERT INTO attendance_live_ui_settings
         (school_id, live_popup_enabled, show_for_students, show_for_staff, show_for_unknown,
          show_for_late_only, show_sms_status, show_guardian_phone, show_fee_balance,
          sound_enabled, popup_duration_ms, mount_scope)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         live_popup_enabled=VALUES(live_popup_enabled), show_for_students=VALUES(show_for_students),
         show_for_staff=VALUES(show_for_staff), show_for_unknown=VALUES(show_for_unknown),
         show_for_late_only=VALUES(show_for_late_only), show_sms_status=VALUES(show_sms_status),
         show_guardian_phone=VALUES(show_guardian_phone), show_fee_balance=VALUES(show_fee_balance),
         sound_enabled=VALUES(sound_enabled), popup_duration_ms=VALUES(popup_duration_ms),
         mount_scope=VALUES(mount_scope), updated_at=CURRENT_TIMESTAMP`,
      [session.schoolId, v.live_popup_enabled, v.show_for_students, v.show_for_staff, v.show_for_unknown,
       v.show_for_late_only, v.show_sms_status, v.show_guardian_phone, v.show_fee_balance,
       v.sound_enabled, v.popup_duration_ms, v.mount_scope],
    );
    return NextResponse.json({ success: true, settings: { school_id: session.schoolId, ...v } });
  } catch (err) {
    console.error('[live-settings PUT]', err);
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}
