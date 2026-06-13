/**
 * GET  /api/attendance/devices/[sn]/reconciliation
 *        → compute the live device⇄DRAIS reconciliation report (no write).
 * POST /api/attendance/devices/[sn]/reconciliation
 *        → run + persist a device_reconciliation_runs row with items.
 *
 * Phase 3C/3K. School-scoped via resolveDeviceForSession.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveDeviceForSession } from '@/lib/biometric/device-access';
import {
  computeReconciliation,
  runDeviceReconciliation,
} from '@/lib/biometric/reconciliation-service';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  const sn = access.device?.sn ?? id;
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const report = await computeReconciliation(access.schoolId, sn);
    return NextResponse.json({ success: true, device: access.device, report });
  } catch (err: any) {
    console.error('[reconciliation GET]', err);
    return NextResponse.json({ error: 'Failed to compute reconciliation' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  const sn = access.device?.sn ?? id;
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const { runId, report } = await runDeviceReconciliation(access.schoolId, sn, {
      triggerSource: 'manual',
      requestedBy: session.userId,
    });
    return NextResponse.json({ success: true, run_id: runId, device: access.device, report });
  } catch (err: any) {
    console.error('[reconciliation POST]', err);
    return NextResponse.json({ error: 'Failed to run reconciliation' }, { status: 500 });
  }
}
