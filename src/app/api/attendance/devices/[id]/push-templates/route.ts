/**
 * POST /api/attendance/devices/[sn]/push-templates
 *
 * Enterprise "Push Templates" operation — deploy stored fingerprint
 * templates from DRAIS (the central biometric authority) onto a device
 * without re-enrollment. Reuses the same distribution machinery as the
 * per-person push in BiometricEnrollmentPanel (template-distribution.ts),
 * scaled to an operator-selected scope.
 *
 * Body: { scope: PushScope, preview?: boolean }
 *   preview: true  → dry run, no writes: counts + estimate + conflicts.
 *   preview: false → executes the push, queues FINGERTMP commands, audits.
 *
 * Bulk-safe by construction: syncTemplatesToDevice never re-queues a
 * template already 'loaded' on this device (template_distributions is
 * unique on (template_id, device_sn)), so repeated clicks are idempotent.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveDeviceForSession } from '@/lib/biometric/device-access';
import { syncTemplatesToDevice, previewTemplatePush, parsePushScope } from '@/lib/biometric/template-distribution';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const sn = access.device!.sn;
  const schoolId = access.schoolId!;

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const scope = parsePushScope(body?.scope);
  if (!scope) return NextResponse.json({ error: 'Invalid scope' }, { status: 400 });
  if (scope.type === 'selected' && scope.personIds.length === 0) {
    return NextResponse.json({ error: 'No people selected' }, { status: 400 });
  }

  try {
    if (body?.preview === true) {
      const preview = await previewTemplatePush({ schoolId, deviceSn: sn, scope });
      return NextResponse.json({
        success: true, preview: true,
        machine: access.device!.deviceName || sn, school_id: schoolId,
        ...preview,
      });
    }

    const startedAt = new Date().toISOString();
    const res = await syncTemplatesToDevice({ schoolId, deviceSn: sn, scope, actorUserId: session.userId });
    return NextResponse.json({
      success: true, started_at: startedAt,
      queued: res.queued, already_loaded: res.alreadyLoaded,
      message: res.queued > 0
        ? `Queued ${res.queued} template(s) to ${access.device!.deviceName || sn}. They load on the device's next heartbeat.`
        : 'Nothing to push — everything in scope is already loaded on this device.',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Push failed' }, { status: 500 });
  }
}
