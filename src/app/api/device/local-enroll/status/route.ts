/**
 * GET /api/device/local-enroll/status?enrollment_id=123
 *
 * Phase 1B — truth-based enrollment status for the local TCP path.
 * The enroll endpoint returns immediately after CMD_STARTENROLL with
 * status 'pending_capture'; the UI polls here. The enrollment becomes
 * 'active' only when the fingerprint template actually arrives via
 * ADMS (zk-handler → completeEnrollmentCapture).
 *
 * Response: {
 *   status: 'pending_capture' | 'active' | 'revoked' | …,
 *   captured: boolean,            // template bytes present in DRAIS
 *   template_count: number,
 *   pin: number, device_sn: string | null
 * }
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { deriveFingerprintLabel } from '@/lib/biometric/fingerprint-status';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const enrollmentId = new URL(req.url).searchParams.get('enrollment_id');
  if (!enrollmentId) {
    return NextResponse.json({ error: 'enrollment_id required' }, { status: 400 });
  }

  try {
    const rows = await query(
      `SELECT id, status, capture_status, captured_at, last_seen_on_device_at,
              pin_value, origin_device_sn, role_type, role_ref_id,
              enrolled_at, updated_at, revoked_reason
         FROM biometric_enrollments
        WHERE id = ? AND school_id = ?
        LIMIT 1`,
      [enrollmentId, session.schoolId],
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Enrollment not found' }, { status: 404 });
    }
    const e = rows[0];

    let templateCount = 0;
    try {
      const t = await query(
        `SELECT COUNT(*) AS n FROM biometric_templates WHERE enrollment_id = ?`,
        [e.id],
      );
      templateCount = Number(t?.[0]?.n ?? 0);
    } catch { /* templates table ensured lazily */ }

    return NextResponse.json({
      success: true,
      enrollment_id: Number(e.id),
      status: e.status,
      capture_status: e.capture_status ?? null,
      label: deriveFingerprintLabel({
        status: e.status,
        captureStatus: e.capture_status ?? null,
        templateCount,
      }),
      captured: e.status === 'active' || e.capture_status === 'captured' || templateCount > 0,
      template_count: templateCount,
      captured_at: e.captured_at ?? null,
      last_seen_on_device_at: e.last_seen_on_device_at ?? null,
      pin: Number(e.pin_value),
      device_sn: e.origin_device_sn ?? null,
      role_type: e.role_type,
      role_ref_id: Number(e.role_ref_id),
      enrolled_at: e.enrolled_at,
      updated_at: e.updated_at,
      note: e.revoked_reason ?? null,
    });
  } catch (err: any) {
    console.error('[local-enroll status] error:', err);
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}
