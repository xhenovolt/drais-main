/**
 * GET/PUT /api/attendance/lessons/settings — per-school lesson attendance policy.
 * GET/PUT /api/attendance/lessons/settings?devices=1 — device → attendance scope mapping.
 * Read = lesson viewers; write = configure-level (admin).
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireLessonAccess, isResponse } from '@/lib/attendance/lessons/access';
import { getLessonPolicy, listDeviceScopes, saveDeviceScope, saveLessonPolicy } from '@/lib/attendance/lessons/service';
import { DEFAULT_LESSON_POLICY } from '@/lib/attendance/lessons/engine';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const s = await requireLessonAccess(req, 'view');
  if (isResponse(s)) return s;
  if (req.nextUrl.searchParams.get('devices') === '1') {
    return NextResponse.json({ success: true, devices: await listDeviceScopes(s.schoolId) });
  }
  return NextResponse.json({ success: true, policy: await getLessonPolicy(s.schoolId, true), defaults: DEFAULT_LESSON_POLICY });
}

export async function PUT(req: NextRequest) {
  const s = await requireLessonAccess(req, 'configure');
  if (isResponse(s)) return s;
  const body = await req.json().catch(() => null) as any;
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  if (req.nextUrl.searchParams.get('devices') === '1') {
    const scope = body.scope === null ? null : (['gate', 'lesson', 'shared'].includes(body.scope) ? body.scope : undefined);
    if (typeof body.deviceSn !== 'string' || scope === undefined) return NextResponse.json({ error: 'deviceSn and scope (gate|lesson|shared|null) are required' }, { status: 400 });
    const ok = await saveDeviceScope(s.schoolId, s.userId, {
      deviceSn: body.deviceSn, scope,
      classId: Number(body.classId) || null, streamId: Number(body.streamId) || null,
      room: typeof body.room === 'string' ? body.room : null,
    });
    if (!ok) return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    return NextResponse.json({ success: true });
  }

  const policy = await saveLessonPolicy(s.schoolId, s.userId, body);
  return NextResponse.json({ success: true, policy });
}
