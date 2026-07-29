/**
 * GET /api/attendance/devices/[sn]/push-templates/report?since=<ISO>
 *
 * Synchronization report for a push started at `since` (the started_at the
 * push endpoint returned). Delivery is heartbeat-driven (ADMS is
 * device-poll-only — DRAIS can't push over an open connection), so this is
 * polled by the UI rather than streamed. Reconciles fresh ACK/failure state
 * first, then reports against template_distributions rows queued at/after
 * the batch start on this device.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveDeviceForSession } from '@/lib/biometric/device-access';
import { reconcileTemplateDistributions } from '@/lib/biometric/template-distribution';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const sn = access.device!.sn;
  const schoolId = access.schoolId!;

  const since = new URL(req.url).searchParams.get('since');
  if (!since) return NextResponse.json({ error: 'since is required (ISO timestamp from the push response)' }, { status: 400 });

  await reconcileTemplateDistributions(schoolId, sn).catch(() => {});

  const rows = (await query(
    `SELECT td.status, td.last_error, td.loaded_at, td.attempted_at,
            bt.finger_index, be.pin_value,
            TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS person_name
       FROM template_distributions td
       JOIN biometric_templates bt ON bt.id = td.template_id
       JOIN biometric_enrollments be ON be.id = bt.enrollment_id
       LEFT JOIN people p ON p.id = be.person_id
      WHERE td.device_sn = ? AND be.school_id = ? AND td.queued_at >= ?`,
    [sn, schoolId, since],
  )) as Array<{
    status: string; last_error: string | null; loaded_at: string | null; attempted_at: string | null;
    finger_index: number; pin_value: number; person_name: string | null;
  }>;

  const loaded = rows.filter((r) => r.status === 'loaded').length;
  const failed = rows.filter((r) => r.status === 'failed');
  const pending = rows.filter((r) => r.status === 'queued').length;

  return NextResponse.json({
    success: true,
    machine: access.device!.deviceName || sn,
    total: rows.length, succeeded: loaded, failed: failed.length, pending,
    duration_ms: Date.now() - Date.parse(since),
    complete: pending === 0,
    failures: failed.map((f) => ({
      person: f.person_name || `PIN ${f.pin_value}`, pin: f.pin_value, finger_index: f.finger_index,
      reason: f.last_error || 'Unknown failure', retry_possible: true,
    })),
  });
}
