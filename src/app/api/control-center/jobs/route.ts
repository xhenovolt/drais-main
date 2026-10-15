/**
 * Control Center — background job queue (Phase 18 / E-14).
 *   GET                 → recent jobs (status, attempts, last error)
 *   POST { action:'run' } → drain due jobs now (request-driven tick; canManage)
 * Read = control session.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession } from '@/lib/control/auth';
import { denied } from '@/lib/control/guard';
import { controlCan } from '@/lib/control/permissions';
import { listJobs, runDueJobs } from '@/lib/control/job-runner';
import { registerCoreHandlers } from '@/lib/control/job-handlers';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'system_health.view')) return denied('system_health.view');
  const jobs = await listJobs(60);
  return NextResponse.json({ success: true, jobs });
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'system_health.manage')) return denied('system_health.manage');
  registerCoreHandlers();
  const res = await runDueJobs();
  return NextResponse.json({ success: true, ...res });
}
