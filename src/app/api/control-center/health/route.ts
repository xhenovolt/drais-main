/**
 * Control Center — Platform Health Center API (Roadmap P4).
 *   GET → every school scanned for problems (licence, attendance flow, devices,
 *         clock drift, SMS, sync), worst-first, with a platform rollup.
 * Control-session gated + audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { getPlatformHealth } from '@/lib/control/platform-health';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    const health = await getPlatformHealth();
    await controlAudit(user.id, 'viewed_platform_health', 'health', { schools_with_issues: health.summary.schoolsWithIssues }, clientIp(req));
    return NextResponse.json({ success: true, ...health });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
