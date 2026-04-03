import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/students/fingerprint-status
 *
 * Returns a map of student_id → has_fingerprint (boolean)
 * for all students in the school that have a zk_user_mapping entry.
 * Used by the student list UI to colour the fingerprint icon.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const rows = await query(
      `SELECT DISTINCT student_id
       FROM zk_user_mapping
       WHERE school_id = ? AND student_id IS NOT NULL`,
      [session.schoolId],
    );

    const enrolledIds: number[] = (rows || []).map((r: any) => r.student_id);

    return NextResponse.json({ success: true, data: enrolledIds });
  } catch (err: any) {
    console.error('[fingerprint-status] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch fingerprint status' }, { status: 500 });
  }
}
