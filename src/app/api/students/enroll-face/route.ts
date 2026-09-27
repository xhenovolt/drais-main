import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { queueFaceEnrollment } from '@/lib/biometric/face-service';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * POST /api/students/enroll-face
 *
 * Registers the student on the device (same PIN as their fingerprints, if any) and asks it to start a
 * face capture. Some ZKTeco firmware refuses a remote ENROLL_BIO (the same limitation fingerprints hit
 * over ADMS) — the person may still need to start the capture from the device's own menu; the identity
 * push this makes is what lets that work. Only the fact of enrolment is stored, never the face image.
 *
 * Body: { student_id: number, device_sn: string }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const studentId = Number(body.student_id);
  const deviceSn = String(body.device_sn || '').trim();
  if (!studentId || !deviceSn) return NextResponse.json({ error: 'student_id and device_sn are required' }, { status: 400 });

  const result = await queueFaceEnrollment({
    schoolId: session.schoolId, userId: (session as any).userId ?? null,
    roleType: 'student', refId: studentId, deviceSn,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 });

  void logAudit({
    schoolId: session.schoolId, userId: (session as any).userId ?? null,
    action: AuditAction.BIOMETRIC_ENROLLED, entityType: 'student', entityId: studentId,
    details: { device_sn: deviceSn, student_name: result.name, biometric_kind: 'face' },
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json({
    success: true,
    student_name: result.name,
    device_user_id: result.pin,
    device_sn: deviceSn,
    already_queued: result.alreadyQueued,
    message: result.alreadyQueued
      ? `Face capture already queued for ${result.name}.`
      : `${result.name} synced to device (PIN ${result.pin}). Ask them to look at the camera now, or start face enrolment on the device menu if it doesn't begin on its own.`,
  });
}
