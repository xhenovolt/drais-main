import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/staff/biometric-status?staff_id=123
 * Get biometric status for a staff member (fingerprints, device mappings, etc.)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const staffId = searchParams.get('staff_id');

    if (!staffId) {
      return NextResponse.json({ error: 'staff_id required' }, { status: 400 });
    }

    // Get staff basic info
    const staffRows = await query(
      `SELECT s.id, p.first_name, p.last_name
       FROM staff s
       JOIN people p ON s.person_id = p.id
       WHERE s.id = ? AND s.school_id = ?
       LIMIT 1`,
      [staffId, session.schoolId],
    );

    if (!staffRows || staffRows.length === 0) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
    }

    // Get fingerprints for this staff
    const fingerprintRows = await query(
      `SELECT id, finger_position, hand, status, is_active, 
              quality_score, enrollment_timestamp, last_matched_at
       FROM fingerprints
       WHERE staff_id = ? AND status != 'revoked'
       ORDER BY finger_position`,
      [staffId],
    );

    // Get device mappings
    const deviceMappingRows = await query(
      `SELECT d.device_user_id, d.device_sn, dev.device_name, 
              dev.device_code, d.is_synced, d.last_sync_at
       FROM device_user_mappings d
       LEFT JOIN biometric_devices dev ON d.device_sn = dev.device_code
       WHERE d.staff_id = ?
       ORDER BY d.created_at DESC`,
      [staffId],
    );

    // Get enrollment status
    const enrollmentRows = await query(
      `SELECT status, COUNT(*) as count
       FROM fingerprints
       WHERE staff_id = ?
       GROUP BY status`,
      [staffId],
    );

    const enrollmentStatus = {} as Record<string, number>;
    if (enrollmentRows && enrollmentRows.length > 0) {
      for (const row of enrollmentRows) {
        enrollmentStatus[row.status] = row.count;
      }
    }

    const hasFingerprints = (fingerprintRows?.length || 0) > 0;
    const enrollmentProgress = Math.min(100, ((fingerprintRows?.length || 0) / 10) * 100);

    return NextResponse.json({
      success: true,
      data: {
        staff_id: staffId,
        name: `${staffRows[0].first_name} ${staffRows[0].last_name}`,
        biometric_status: {
          has_fingerprints: hasFingerprints,
          fingerprint_count: fingerprintRows?.length || 0,
          enrollment_progress: Math.round(enrollmentProgress),
          fingerprints: fingerprintRows || [],
          enrollment_status: enrollmentStatus,
        },
        device_mappings: deviceMappingRows || [],
      },
    });
  } catch (err: any) {
    console.error('[staff/biometric-status] Error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to fetch biometric status' },
      { status: 500 },
    );
  }
}
