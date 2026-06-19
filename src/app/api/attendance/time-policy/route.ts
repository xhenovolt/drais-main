/**
 * GET/PUT /api/attendance/time-policy
 *
 * Per-school device time policy (attendance_time_policy). Controls how
 * DRAIS interprets device clocks: which timezone, whether to trust device
 * time / server time / correct by drift / flag for review, whether DRAIS
 * may push a time-sync command to devices, drift tolerance, backlog
 * handling, and raw/corrected display.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { clearTimePolicyCache } from '@/lib/attendance/device-clock';

export const runtime = 'nodejs';

const POLICIES = ['TRUST_DEVICE_TIME', 'TRUST_SERVER_RECEIVE_TIME', 'CORRECT_BY_DRIFT', 'MANUAL_REVIEW_IF_DRIFT'];

const DEFAULTS = {
  school_timezone: 'Africa/Kampala',
  utc_offset_minutes: 180,
  device_time_policy: 'CORRECT_BY_DRIFT',
  auto_sync_device_time: 0,
  max_allowed_drift_seconds: 120,
  correct_offline_backlog: 1,
  display_raw_and_corrected_time: 0,
};

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const rows = (await query(
      `SELECT * FROM attendance_time_policy WHERE school_id = ? LIMIT 1`,
      [session.schoolId],
    )) as any[];
    const settings = rows[0] ?? { school_id: session.schoolId, ...DEFAULTS };
    return NextResponse.json({ success: true, settings });
  } catch {
    return NextResponse.json({ success: true, settings: { school_id: session.schoolId, ...DEFAULTS } });
  }
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const v = { ...DEFAULTS };
  if (typeof body.school_timezone === 'string') v.school_timezone = body.school_timezone.slice(0, 64);
  if (Number.isFinite(Number(body.utc_offset_minutes))) v.utc_offset_minutes = Math.max(-720, Math.min(840, Number(body.utc_offset_minutes)));
  if (POLICIES.includes(body.device_time_policy)) v.device_time_policy = body.device_time_policy;
  v.auto_sync_device_time = body.auto_sync_device_time ? 1 : 0;
  if (Number.isFinite(Number(body.max_allowed_drift_seconds))) v.max_allowed_drift_seconds = Math.max(0, Math.min(86400, Number(body.max_allowed_drift_seconds)));
  v.correct_offline_backlog = body.correct_offline_backlog ? 1 : 0;
  v.display_raw_and_corrected_time = body.display_raw_and_corrected_time ? 1 : 0;

  try {
    await query(
      `INSERT INTO attendance_time_policy
         (school_id, school_timezone, utc_offset_minutes, device_time_policy, auto_sync_device_time,
          max_allowed_drift_seconds, correct_offline_backlog, display_raw_and_corrected_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         school_timezone=VALUES(school_timezone), utc_offset_minutes=VALUES(utc_offset_minutes),
         device_time_policy=VALUES(device_time_policy), auto_sync_device_time=VALUES(auto_sync_device_time),
         max_allowed_drift_seconds=VALUES(max_allowed_drift_seconds),
         correct_offline_backlog=VALUES(correct_offline_backlog),
         display_raw_and_corrected_time=VALUES(display_raw_and_corrected_time),
         updated_at=CURRENT_TIMESTAMP`,
      [session.schoolId, v.school_timezone, v.utc_offset_minutes, v.device_time_policy, v.auto_sync_device_time,
       v.max_allowed_drift_seconds, v.correct_offline_backlog, v.display_raw_and_corrected_time],
    );
    clearTimePolicyCache(session.schoolId);
    return NextResponse.json({ success: true, settings: { school_id: session.schoolId, ...v } });
  } catch (err: any) {
    return NextResponse.json({ error: 'Failed to save time policy', details: err?.message }, { status: 500 });
  }
}
