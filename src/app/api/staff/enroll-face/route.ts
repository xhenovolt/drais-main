import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { queueFaceEnrollment } from '@/lib/biometric/face-service';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * POST /api/staff/enroll-face — staff twin of /api/students/enroll-face. See that route for behaviour.
 * Body: { staff_id: number, device_sn: string }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const staffId = Number(body.staff_id);
  const deviceSn = String(body.device_sn || '').trim();
  if (!staffId || !deviceSn) return NextResponse.json({ error: 'staff_id and device_sn are required' }, { status: 400 });

  const result = await queueFaceEnrollment({
    schoolId: session.schoolId, userId: (session as any).userId ?? null,
    roleType: 'staff', refId: staffId, deviceSn,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  void logAudit({
    schoolId: session.schoolId, userId: (session as any).userId ?? null,
    action: AuditAction.BIOMETRIC_ENROLLED, entityType: 'staff', entityId: staffId,
    details: { device_sn: deviceSn, staff_name: result.name, biometric_kind: 'face' },
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json({
    success: true,
    staff_name: result.name,
    device_user_id: result.pin,
    device_sn: deviceSn,
    already_queued: result.alreadyQueued,
    message: result.alreadyQueued
      ? `Face capture already queued for ${result.name}.`
      : `${result.name} synced to device (PIN ${result.pin}). Ask them to look at the camera now, or start face enrolment on the device menu if it doesn't begin on its own.`,
  });
}
