import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/zk/user-mapping
 * List device-to-user mappings with pagination and filters.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const userType = url.searchParams.get('user_type'); // 'student' | 'staff'
  const deviceSn = url.searchParams.get('device_sn');
  const search = url.searchParams.get('search');
  const page = Math.max(1, parseInt(url.searchParams.get('page', 10) || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit', 10) || '50', 10)));
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = ['m.school_id = ?'];
    const params: any[] = [session.schoolId];

    if (userType === 'student' || userType === 'staff') {
      conditions.push('m.user_type = ?');
      params.push(userType);
    }
    if (deviceSn) {
      conditions.push('(m.device_sn = ? OR m.device_sn IS NULL)');
      params.push(deviceSn);
    }
    if (search) {
      conditions.push('m.device_user_id LIKE ?');
      params.push(`%${search}%`);
    }

    const where = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM zk_user_mapping m WHERE ${where}`,
      params,
    );
    const total = Number(countResult[0]?.total || 0);

    const rows = await query(
      `SELECT
         m.id, m.device_user_id, m.user_type, m.student_id, m.staff_id,
         m.device_sn, m.card_number, m.created_at
       FROM zk_user_mapping m
       WHERE ${where}
       ORDER BY m.device_user_id ASC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[ZK UserMapping GET] Error:', err);
    return NextResponse.json({ error: 'Failed to load mappings' }, { status: 500 });
  }
}

/**
 * POST /api/attendance/zk/user-mapping
 * Create a new device-to-user mapping.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { device_user_id, user_type, student_id, staff_id, device_sn, card_number } = body;

    if (!device_user_id || !user_type) {
      return NextResponse.json(
        { error: 'device_user_id and user_type are required' },
        { status: 400 },
      );
    }

    if (user_type === 'student' && !student_id) {
      return NextResponse.json({ error: 'student_id required for student mapping' }, { status: 400 });
    }
    if (user_type === 'staff' && !staff_id) {
      return NextResponse.json({ error: 'staff_id required for staff mapping' }, { status: 400 });
    }

    // Check for duplicate (school-scoped)
    const existing = await query(
      `SELECT id FROM zk_user_mapping
       WHERE school_id = ? AND device_user_id = ? AND (device_sn = ? OR (? IS NULL AND device_sn IS NULL))`,
      [session.schoolId, device_user_id, device_sn || null, device_sn || null],
    );
    if (existing && existing.length > 0) {
      return NextResponse.json({ error: 'Mapping already exists for this device user ID' }, { status: 409 });
    }

    const trimmedUserId = String(device_user_id).trim();
    const mappedStudentId = user_type === 'student' ? student_id : null;
    const mappedStaffId = user_type === 'staff' ? staff_id : null;

    const result = await query(
      `INSERT INTO zk_user_mapping (school_id, device_user_id, user_type, student_id, staff_id, device_sn, card_number)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        session.schoolId,
        trimmedUserId,
        user_type,
        mappedStudentId,
        mappedStaffId,
        device_sn || null,
        card_number || null,
      ],
    );

    // Re-match existing unmatched attendance logs for this device_user_id
    let rematched = 0;
    try {
      const rematchResult = await query(
        `UPDATE zk_attendance_logs
         SET student_id = ?, staff_id = ?, matched = 1
         WHERE school_id = ? AND device_user_id = ? AND matched = 0`,
        [mappedStudentId, mappedStaffId, session.schoolId, trimmedUserId],
      );
      rematched = (rematchResult as any)?.affectedRows || 0;
    } catch (rematchErr) {
      console.error('[ZK UserMapping POST] Re-match failed:', rematchErr);
      // Non-fatal — mapping was still created
    }

    return NextResponse.json({
      success: true,
      message: `Mapping created${rematched > 0 ? `. ${rematched} existing logs re-matched.` : ''}`,
      id: (result as any)?.insertId,
      rematched,
    });
  } catch (err) {
    console.error('[ZK UserMapping POST] Error:', err);
    return NextResponse.json({ error: 'Failed to create mapping' }, { status: 500 });
  }
}

/**
 * PUT /api/attendance/zk/user-mapping
 * Update an existing mapping.
 */
export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, device_user_id, user_type, student_id, staff_id, device_sn, card_number } = body;

    if (!id) {
      return NextResponse.json({ error: 'Mapping ID required' }, { status: 400 });
    }

    const existing = await query(
      'SELECT id, device_user_id FROM zk_user_mapping WHERE id = ? AND school_id = ?',
      [id, session.schoolId],
    );
    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
    }

    const mappedStudentId = user_type === 'student' ? student_id : null;
    const mappedStaffId = user_type === 'staff' ? staff_id : null;

    await query(
      `UPDATE zk_user_mapping SET
         device_user_id = COALESCE(?, device_user_id),
         user_type = COALESCE(?, user_type),
         student_id = ?,
         staff_id = ?,
         device_sn = ?,
         card_number = ?,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND school_id = ?`,
      [
        device_user_id || null,
        user_type || null,
        mappedStudentId,
        mappedStaffId,
        device_sn || null,
        card_number || null,
        id,
        session.schoolId,
      ],
    );

    // Re-match existing attendance logs for the device_user_id
    const targetDeviceUserId = device_user_id || existing[0].device_user_id;
    let rematched = 0;
    try {
      const rematchResult = await query(
        `UPDATE zk_attendance_logs
         SET student_id = ?, staff_id = ?, matched = 1
         WHERE school_id = ? AND device_user_id = ? AND matched = 0`,
        [mappedStudentId, mappedStaffId, session.schoolId, String(targetDeviceUserId).trim()],
      );
      rematched = (rematchResult as any)?.affectedRows || 0;
    } catch (rematchErr) {
      console.error('[ZK UserMapping PUT] Re-match failed:', rematchErr);
    }

    return NextResponse.json({
      success: true,
      message: `Mapping updated${rematched > 0 ? `. ${rematched} logs re-matched.` : ''}`,
      rematched,
    });
  } catch (err) {
    console.error('[ZK UserMapping PUT] Error:', err);
    return NextResponse.json({ error: 'Failed to update mapping' }, { status: 500 });
  }
}

/**
 * DELETE /api/attendance/zk/user-mapping
 * Delete a mapping.
 */
export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Mapping ID required' }, { status: 400 });
  }

  try {
    const existing = await query(
      'SELECT id FROM zk_user_mapping WHERE id = ? AND school_id = ?',
      [id, session.schoolId],
    );
    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'Mapping not found' }, { status: 404 });
    }

    await query(
      'DELETE FROM zk_user_mapping WHERE id = ? AND school_id = ?',
      [id, session.schoolId],
    );

    return NextResponse.json({ success: true, message: 'Mapping deleted' });
  } catch (err) {
    console.error('[ZK UserMapping DELETE] Error:', err);
    return NextResponse.json({ error: 'Failed to delete mapping' }, { status: 500 });
  }
}
