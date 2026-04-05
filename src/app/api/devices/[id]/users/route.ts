import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * DEVICE USER MAPPING API
 * Maps device numeric IDs to DRAIS student IDs
 * 
 * This is critical for attendance: when a device reports "user 105 scanned",
 * we need to know which student that maps to.
 * 
 * Route: /api/devices/[id]/users
 * 
 * All operations are tenant-isolated via school_id
 */

/**
 * GET /api/devices/[id]/users
 * List all user mappings for a device
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const connection = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    
    if (!session?.schoolId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const schoolId = session.schoolId;
    const { id: deviceId } = await params;
    
    // Verify device belongs to school
    const [devices] = await connection.execute<any[]>(
      'SELECT id, device_name, device_type FROM devices WHERE id = ? AND school_id = ?',
      [deviceId, schoolId]
    );
    
    if (devices.length === 0) {
      return NextResponse.json(
        { error: 'Device not found or access denied' },
        { status: 404 }
      );
    }
    
    const device = devices[0];
    
    // Get all user mappings with student info
    const [mappings] = await connection.execute<any[]>(
      `SELECT 
        du.id,
        du.device_user_id,
        du.student_id,
        du.enrolled_at,
        s.first_name,
        s.last_name,
        s.student_number,
        s.grade,
        s.division
      FROM device_users du
      INNER JOIN students s ON du.student_id = s.id
      WHERE du.device_id = ? AND du.school_id = ?
      ORDER BY du.device_user_id`,
      [deviceId, schoolId]
    );
    
    return NextResponse.json({
      device: {
        id: device.id,
        name: device.device_name,
        type: device.device_type
      },
      mappings: mappings.map(m => ({
        id: m.id,
        device_user_id: m.device_user_id,
        student_id: m.student_id,
        student_name: `${m.first_name} ${m.last_name}`,
        student_number: m.student_number,
        grade: m.grade,
        division: m.division,
        enrolled_at: m.enrolled_at
      })),
      total: mappings.length
    });
    
  } catch (error: any) {
    console.error('[Device Users API] Error fetching mappings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user mappings', message: error.message },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}

/**
 * POST /api/devices/[id]/users
 * Create a new user mapping
 * 
 * Body: {
 *   device_user_id: "105",
 *   student_id: 42
 * }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const connection = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    
    if (!session?.schoolId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const schoolId = session.schoolId;
    const { id: deviceId } = await params;
    const body = await req.json();
    
    // Validate required fields
    if (!body.device_user_id || !body.student_id) {
      return NextResponse.json(
        { error: 'Missing required fields: device_user_id, student_id' },
        { status: 400 }
      );
    }
    
    // Verify device belongs to school
    const [devices] = await connection.execute<any[]>(
      'SELECT id FROM devices WHERE id = ? AND school_id = ?',
      [deviceId, schoolId]
    );
    
    if (devices.length === 0) {
      return NextResponse.json(
        { error: 'Device not found or access denied' },
        { status: 404 }
      );
    }
    
    // Verify student belongs to school
    const [students] = await connection.execute<any[]>(
      'SELECT id, first_name, last_name FROM students WHERE id = ? AND school_id = ?',
      [body.student_id, schoolId]
    );
    
    if (students.length === 0) {
      return NextResponse.json(
        { error: 'Student not found or access denied' },
        { status: 404 }
      );
    }
    
    const student = students[0];
    
    // Check for duplicate mapping (same device_user_id on this device)
    const [existing] = await connection.execute<any[]>(
      'SELECT id FROM device_users WHERE device_id = ? AND device_user_id = ? AND school_id = ?',
      [deviceId, body.device_user_id, schoolId]
    );
    
    if (existing.length > 0) {
      return NextResponse.json(
        { error: 'Device user ID already mapped on this device' },
        { status: 409 }
      );
    }
    
    // Create mapping
    const [result] = await connection.execute<any>(
      `INSERT INTO device_users (school_id, device_id, device_user_id, student_id, enrolled_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [schoolId, deviceId, body.device_user_id, body.student_id]
    );
    
    console.log(
      `[Device Users API] Created mapping: device_user_id ${body.device_user_id} → ` +
      `student ${student.first_name} ${student.last_name} (ID: ${body.student_id})`
    );
    
    return NextResponse.json(
      {
        success: true,
        message: 'User mapping created successfully',
        mapping: {
          id: result.insertId,
          device_user_id: body.device_user_id,
          student_id: body.student_id,
          student_name: `${student.first_name} ${student.last_name}`
        }
      },
      { status: 201 }
    );
    
  } catch (error: any) {
    console.error('[Device Users API] Error creating mapping:', error);
    return NextResponse.json(
      { error: 'Failed to create user mapping', message: error.message },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}

/**
 * DELETE /api/devices/[id]/users?mapping_id=123
 * Delete a user mapping
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const connection = await getConnection();
  try {
    const session = await getSessionSchoolId(req);
    
    if (!session?.schoolId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const schoolId = session.schoolId;
    const { id: deviceId } = await params;
    const { searchParams } = new URL(req.url);
    const mappingId = searchParams.get('mapping_id');
    
    if (!mappingId) {
      return NextResponse.json(
        { error: 'Mapping ID is required' },
        { status: 400 }
      );
    }
    
    // Verify mapping belongs to school and device
    const [mappings] = await connection.execute<any[]>(
      'SELECT id FROM device_users WHERE id = ? AND device_id = ? AND school_id = ?',
      [mappingId, deviceId, schoolId]
    );
    
    if (mappings.length === 0) {
      return NextResponse.json(
        { error: 'Mapping not found or access denied' },
        { status: 404 }
      );
    }
    
    // Delete mapping
    await connection.execute('DELETE FROM device_users WHERE id = ?', [mappingId]);
    
    console.log(`[Device Users API] Deleted mapping ID ${mappingId}`);
    
    return NextResponse.json({
      success: true,
      message: 'User mapping deleted successfully'
    });
    
  } catch (error: any) {
    console.error('[Device Users API] Error deleting mapping:', error);
    return NextResponse.json(
      { error: 'Failed to delete user mapping', message: error.message },
      { status: 500 }
    );
  } finally {
    await connection.end();
  }
}
