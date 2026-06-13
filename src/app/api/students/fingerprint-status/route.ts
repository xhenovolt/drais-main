import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getFingerprintStatuses } from '@/lib/biometric/fingerprint-status';

export const runtime = 'nodejs';

/**
 * GET /api/students/fingerprint-status
 *
 * Phase 2K rewrite — canonical status from biometric_enrollments +
 * biometric_templates via the fingerprint-status service.
 *
 * Response (backward compatible):
 *   data:     number[]                 — student ids whose punches resolve
 *                                        (status='active'; what the old
 *                                        boolean consumers expect)
 *   statuses: Record<studentId, {...}> — full lifecycle detail: label,
 *             status, capture_status, pin, device, template_count,
 *             captured_at, last_seen_on_device_at, source
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const statuses = await getFingerprintStatuses(session.schoolId, 'student');

    // Legacy-only students (template in student_fingerprints but no
    // canonical enrollment at all) still count as "has fingerprint"
    // for the boolean consumers.
    const legacyOnly = new Set<number>();
    try {
      const rows = await query(
        `SELECT DISTINCT student_id FROM student_fingerprints
          WHERE school_id = ? AND status = 'active' AND student_id IS NOT NULL`,
        [session.schoolId],
      );
      for (const r of rows || []) {
        const id = Number(r.student_id);
        if (id && !statuses.has(id)) legacyOnly.add(id);
      }
    } catch { /* legacy table optional */ }

    const usableIds: number[] = [...legacyOnly];
    const statusMap: Record<number, unknown> = {};
    for (const [refId, s] of statuses) {
      if (s.usable) usableIds.push(refId);
      statusMap[refId] = {
        label: s.label,
        status: s.status,
        capture_status: s.captureStatus,
        pin: s.pin,
        device_sn: s.deviceSn,
        device_name: s.deviceName,
        template_count: s.templateCount,
        legacy_template: s.legacyTemplate,
        captured_at: s.capturedAt,
        last_seen_on_device_at: s.lastSeenOnDeviceAt,
        enrollment_id: s.enrollmentId,
        source: s.enrollmentSource,
      };
    }

    return NextResponse.json({ success: true, data: usableIds, statuses: statusMap });
  } catch (err: any) {
    console.error('[fingerprint-status] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch fingerprint status' }, { status: 500 });
  }
}
