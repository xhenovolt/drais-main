/**
 * GET/PUT /api/attendance/settings/quiet-hours
 *
 * School-wide SMS quiet hours: a punch-backed arrival/late verdict whose
 * punch time falls inside this window is never texted to a parent (e.g. a
 * boarding school muting 00:00-05:00 when boarders are known to play with
 * the biometric device overnight). Does not affect the punch, the
 * attendance record, or biometric evidence — only SMS eligibility.
 * See src/lib/attendance/sms-quiet-hours.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getSmsQuietHours, setSmsQuietHours } from '@/lib/attendance/sms-quiet-hours';

export const runtime = 'nodejs';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const quiet = await getSmsQuietHours(session.schoolId);
  return NextResponse.json({ success: true, ...quiet });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  const enabled = Boolean(body.enabled);
  const start = typeof body.start === 'string' ? body.start : '00:00';
  const end = typeof body.end === 'string' ? body.end : '05:00';
  if (enabled && (!TIME_RE.test(start) || !TIME_RE.test(end))) {
    return NextResponse.json({ error: 'start/end must be HH:MM (24-hour)' }, { status: 400 });
  }
  if (enabled && start === end) {
    return NextResponse.json({ error: 'start and end cannot be the same time' }, { status: 400 });
  }
  await setSmsQuietHours(session.schoolId, { enabled, start, end });
  return NextResponse.json({ success: true, enabled, start, end });
}
