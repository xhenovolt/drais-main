/**
 * POST /api/control-center/schools/provision — one-click new-school onboarding
 * (P20). Creates school + SuperAdmin + first admin (forced password reset) and
 * assigns a plan. Requires the schools.manage capability. Audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { validateProvisionInput, provisionSchool } from '@/lib/control/provisioning';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'schools.manage')) {
    return NextResponse.json({ error: 'You do not have permission to provision schools' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = validateProvisionInput(body || {});
  if (!parsed.ok) {
    const reason = 'reason' in parsed ? parsed.reason : 'Invalid input';
    return NextResponse.json({ error: reason }, { status: 400 });
  }

  const res = await provisionSchool(parsed.value, user.id, clientIp(req));
  if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });

  return NextResponse.json({
    success: true,
    school_id: res.schoolId,
    admin_email: res.adminEmail,
    temp_password: res.tempPassword,
    plan: res.plan,
  });
}
