/**
 * Control Center — platform business intelligence (Phase 24 / E-21).
 *   GET → MRR/ARR, revenue, outstanding, school + plan mix, churn.
 * Control-session gated + audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { denied } from '@/lib/control/guard';
import { controlCan } from '@/lib/control/permissions';
import { getPlatformBI } from '@/lib/control/platform-bi';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'bi.view')) return denied('bi.view');
  const bi = await getPlatformBI();
  await controlAudit(user.id, 'viewed_bi', 'bi', null, clientIp(req)).catch(() => {});
  return NextResponse.json({ success: true, ...bi });
}
