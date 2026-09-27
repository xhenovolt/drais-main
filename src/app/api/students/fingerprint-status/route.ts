import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { getFingerprintStatuses, statusToApi } from '@/lib/biometric/fingerprint-status';
import { fingerprintLevel } from '@/lib/biometric/fingers';

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
    const legacyOnly = new Map<number, number>();
    try {
      const rows = await query(
        `SELECT student_id, COUNT(*) AS n FROM student_fingerprints
          WHERE school_id = ? AND status = 'active' AND student_id IS NOT NULL
          GROUP BY student_id`,
        [session.schoolId],
      );
      for (const r of rows || []) {
        const id = Number(r.student_id);
        if (id && !statuses.has(id)) legacyOnly.set(id, Number(r.n) || 1);
      }
    } catch { /* legacy table optional */ }

    const usableIds: number[] = [...legacyOnly.keys()];
    const statusMap: Record<number, unknown> = {};
    for (const [refId, s] of statuses) {
      if (s.usable) usableIds.push(refId);
      statusMap[refId] = statusToApi(s);
    }
    // Older fingerprints that only exist in the legacy table: still counted, so the list can show how many.
    for (const [id, n] of legacyOnly) {
      statusMap[id] = {
        label: 'Active', status: 'active', capture_status: null, pin: null, device_sn: null, device_name: null,
        template_count: 0, finger_indices: [], finger_count: n,
        level: fingerprintLevel({ label: 'Active', fingerCount: n }).level,
        face_captured: false, face_requested: false, legacy_template: true,
        captured_at: null, last_seen_on_device_at: null, enrollment_id: null, source: 'legacy',
      };
    }

    return NextResponse.json({ success: true, data: usableIds, statuses: statusMap });
  } catch (err: any) {
    console.error('[fingerprint-status] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch fingerprint status' }, { status: 500 });
  }
}
