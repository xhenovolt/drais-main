import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * POST /api/students/bulk/status
 * 
 * Bulk change student status (active -> left, suspended, etc).
 * 
 * Request:
 * {
 *   "student_ids": [1, 2, 3],
 *   "status": "left" | "suspended" | "graduated" | "active",
 *   "reason": "Optional reason for status change" (required for 'left')
 * }
 * 
 * Security:
 * - Requires authentication
 * - All students must belong to the school
 * - Creates audit trail with timestamps
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    const { student_ids, status, reason } = await req.json();

    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return NextResponse.json(
        { error: 'Invalid student_ids' },
        { status: 400 }
      );
    }

    if (!status || !['active', 'left', 'graduated', 'suspended'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status' },
        { status: 400 }
      );
    }

    if (status === 'left' && !reason) {
      return NextResponse.json(
        { error: 'Reason required for "left" status' },
        { status: 400 }
      );
    }

    // Verify all students belong to school
    const [verification]: any = await conn.execute(
      `SELECT COUNT(*) as cnt FROM students WHERE school_id = ? AND id IN (${student_ids.map(() => '?').join(',')})`,
      [schoolId, ...student_ids]
    );

    if (verification[0].cnt !== student_ids.length) {
      return NextResponse.json(
        { error: 'Some students do not belong to your school' },
        { status: 403 }
      );
    }

    // Update status
    let query = `UPDATE students SET status = ?, updated_at = NOW()`;
    const params: any[] = [status, schoolId];

    if (status === 'left') {
      query += `, left_at = NOW(), left_reason = ?`;
      params.splice(2, 0, reason);
    } else if (status === 'graduated') {
      query += `, left_at = NOW()`;
    }

    query += ` WHERE school_id = ? AND id IN (${student_ids.map(() => '?').join(',')})`;

    await conn.execute(query, [...params, schoolId, ...student_ids]);

    return getResponseJson({
      success: true,
      message: `Updated ${student_ids.length} student(s) to "${status}"`,
      updated: student_ids.length,
      status
    });
  } catch (error) {
    console.error('Bulk status change error:', error);
    return NextResponse.json(
      { error: 'Failed to process bulk status change' },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}

function getResponseJson(data: any) {
  return NextResponse.json(data);
}
