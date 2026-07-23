/**
 * Attendance Time Health API — the Time Intelligence Engine surface.
 *
 * GET  → device clock health for today (runs the sweep), baselines,
 *        drift history + correction audit. ?banner=1 returns only the
 *        worst status (cheap poll for the logs-page warning).
 * POST → { action: 'preview',  device_sn, date, shift_minutes }
 *        { action: 'apply',    device_sn, date, shift_minutes }
 *        { action: 'undo',     correction_id }
 *        { action: 'relearn',  device_sn }   (recompute baseline)
 * Corrections require the device-admin permission; nothing is changed
 * without an explicit apply, and every apply is undoable.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import {
  deviceHealthOverview, sweepToday, previewCorrection, applyCorrection, undoCorrection, learnBaseline,
} from '@/lib/attendance/time-intelligence/engine';
import { fmtMinute } from '@/lib/attendance/time-intelligence/confidence';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    if (new URL(req.url).searchParams.get('banner')) {
      const today = await sweepToday(session.schoolId);
      const worst = today.filter(t => t.status === 'anomaly').sort((a, b) => a.confidence - b.confidence)[0] || null;
      // Compact per-device list for inline badges (logs page + dashboard).
      const devices = today.map(t => ({
        device_sn: t.device_sn, status: t.status, confidence: t.confidence,
        offset_min: t.offsetEstimateMin, cause: t.likelyCause, batch: t.batch_size,
      }));
      return NextResponse.json({ success: true, anomaly: worst, devices });
    }
    const overview = await deviceHealthOverview(session.schoolId);
    return NextResponse.json({ success: true, ...overview, fmt: undefined });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'attendance.devices.manage', session.isSuperAdmin);
  } catch {
    // Fall back: super admins and school admins manage device time.
    if (!session.isSuperAdmin) {
      try { await requirePermission(session.userId, session.schoolId, 'attendance.manage', session.isSuperAdmin); }
      catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }
    }
  }

  const b = await req.json().catch(() => null);
  if (!b?.action) return NextResponse.json({ error: 'action is required' }, { status: 400 });
  try {
    switch (b.action) {
      case 'preview': {
        const shift = Number(b.shift_minutes);
        if (!b.device_sn || !b.date || !Number.isFinite(shift) || shift === 0) {
          return NextResponse.json({ error: 'device_sn, date and non-zero shift_minutes are required' }, { status: 400 });
        }
        const res = await previewCorrection(session.schoolId, String(b.device_sn), String(b.date), shift);
        return NextResponse.json({ success: true, ...res });
      }
      case 'apply': {
        const shift = Number(b.shift_minutes);
        if (!b.device_sn || !b.date || !Number.isFinite(shift) || shift === 0 || Math.abs(shift) > 24 * 60) {
          return NextResponse.json({ error: 'device_sn, date and a sane shift_minutes are required' }, { status: 400 });
        }
        const res = await applyCorrection(session.schoolId, String(b.device_sn), String(b.date), shift, session.userId, 'assisted');
        return NextResponse.json({ success: true, ...res });
      }
      case 'undo': {
        const id = Number(b.correction_id);
        if (!Number.isFinite(id)) return NextResponse.json({ error: 'correction_id is required' }, { status: 400 });
        const res = await undoCorrection(session.schoolId, id, session.userId);
        return NextResponse.json({ success: true, ...res });
      }
      case 'relearn': {
        if (!b.device_sn) return NextResponse.json({ error: 'device_sn is required' }, { status: 400 });
        const baseline = await learnBaseline(session.schoolId, String(b.device_sn));
        return NextResponse.json({
          success: true, baseline,
          summary: baseline ? `Usual first arrival ${fmtMinute(baseline.median_first_minute)} over ${baseline.sample_days} days` : 'Not enough history yet',
        });
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${b.action}` }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
