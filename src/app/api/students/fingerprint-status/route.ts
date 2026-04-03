import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/students/fingerprint-status
 *
 * Returns a map of student_id → has_fingerprint (boolean)
 * for all students in the school that have an actual fingerprint template
 * stored (student_fingerprints or fingerprints table), OR a successfully
 * acknowledged ENROLL command in zk_device_commands.
 *
 * Note: A zk_user_mapping entry alone does NOT mean the student has a
 * fingerprint — it only means the user ID is registered on the device.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // Source 1: student_fingerprints with active template
    const fpRows = await query(
      `SELECT DISTINCT student_id
       FROM student_fingerprints
       WHERE school_id = ? AND status = 'active' AND student_id IS NOT NULL`,
      [session.schoolId],
    );

    // Source 2: fingerprints table
    const fpRows2 = await query(
      `SELECT DISTINCT student_id
       FROM fingerprints
       WHERE school_id = ? AND student_id IS NOT NULL`,
      [session.schoolId],
    );

    // Source 3: Acknowledged ENROLL commands (device confirmed capture)
    // Commands use device school_id (not student school_id), so join through
    // students table to filter by session school instead of command school_id.
    const ackRows = await query(
      `SELECT DISTINCT m.student_id
       FROM zk_device_commands c
       JOIN zk_user_mapping m
         ON c.device_sn = m.device_sn
         AND c.command LIKE CONCAT('%ENROLL PIN=', m.device_user_id, '%')
       JOIN students s ON m.student_id = s.id
       WHERE c.status = 'acknowledged'
         AND s.school_id = ?
         AND m.student_id IS NOT NULL`,
      [session.schoolId],
    );

    const idSet = new Set<number>();
    for (const r of [...(fpRows || []), ...(fpRows2 || []), ...(ackRows || [])]) {
      if (r.student_id) idSet.add(r.student_id);
    }

    return NextResponse.json({ success: true, data: Array.from(idSet) });
  } catch (err: any) {
    console.error('[fingerprint-status] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch fingerprint status' }, { status: 500 });
  }
}
