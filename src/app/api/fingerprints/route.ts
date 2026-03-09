import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * POST /api/fingerprints/register
 * Register fingerprint for a student (USB scanner capture)
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const action = url.searchParams.get('action');

  if (action === 'register-usb') {
    return registerUSBFingerprint(req);
  } else if (action === 'link-existing') {
    return linkExistingFingerprint(req);
  } else if (action === 'verify') {
    return verifyFingerprint(req);
  } else if (action === 'remove') {
    return removeFingerprint(req);
  }

  // Default: list fingerprints
  return listFingerprints(req);
}

/**
 * GET /api/fingerprints
 * List student fingerprints
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const studentId = searchParams.get('student_id');
  const deviceId = searchParams.get('device_id');

  return listFingerprints(req);
}

async function listFingerprints(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('student_id');
    const deviceId = searchParams.get('device_id');

    connection = await getConnection();

    let sql = `
      SELECT 
        sf.id,
        sf.student_id,
        sf.device_id,
        sf.finger_position,
        sf.hand,
        sf.template_format,
        sf.biometric_uuid,
        sf.quality_score,
        sf.enrollment_timestamp,
        sf.is_active,
        sf.status,
        sf.last_matched_at,
        sf.match_count,
        bd.device_name,
        bd.device_code,
        CONCAT(p.first_name, ' ', p.last_name) as student_name
      FROM student_fingerprints sf
      LEFT JOIN biometric_devices bd ON sf.device_id = bd.id
      LEFT JOIN students s ON sf.student_id = s.id
      LEFT JOIN people p ON s.person_id = p.id
      WHERE 1=1
    `;

    const params: any[] = [];

    if (studentId) {
      sql += ` AND sf.student_id = ?`;
      params.push(studentId);
    }

    if (deviceId) {
      sql += ` AND sf.device_id = ?`;
      params.push(deviceId);
    }

    sql += ` ORDER BY sf.enrollment_timestamp DESC`;

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows || []
    });

  } catch (error: any) {
    console.error('Fingerprints fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch fingerprints'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Register fingerprint via USB scanner
 */
async function registerUSBFingerprint(req: NextRequest) {
  let connection;
  try {
    const body = await req.json();
    const {
      student_id,
      template_data,
      template_format = 'ISO/IEC 19794-2',
      finger_position = 'index',
      hand = 'right',
      quality_score = 0,
      biometric_uuid
    } = body;

    if (!student_id || !template_data) {
      return NextResponse.json({
        success: false,
        error: 'student_id and template_data are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Get student info
    const [students] = await connection.execute(
      'SELECT school_id FROM students WHERE id = ?',
      [student_id]
    );

    if (!Array.isArray(students) || students.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Student not found'
      }, { status: 404 });
    }

    const schoolId = (students[0] as any).school_id;

    // Check if this student already has a fingerprint for this position
    const [existing] = await connection.execute(
      `SELECT id FROM student_fingerprints 
       WHERE student_id = ? AND finger_position = ? AND hand = ?`,
      [student_id, finger_position, hand]
    );

    let fingerprintId;
    if (Array.isArray(existing) && existing.length > 0) {
      // Update existing
      fingerprintId = (existing[0] as any).id;
      await connection.execute(
        `UPDATE student_fingerprints 
         SET template_data = ?, template_format = ?, quality_score = ?,
             biometric_uuid = ?, updated_at = NOW()
         WHERE id = ?`,
        [template_data, template_format, quality_score, biometric_uuid, fingerprintId]
      );
    } else {
      // Create new
      const [result] = await connection.execute(
        `INSERT INTO student_fingerprints (
          school_id, student_id, finger_position, hand, template_data,
          template_format, quality_score, biometric_uuid, status, is_active,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, NOW())`,
        [
          schoolId, student_id, finger_position, hand, template_data,
          template_format, quality_score, biometric_uuid
        ]
      );
      fingerprintId = (result as any).insertId;
    }

    return NextResponse.json({
      success: true,
      message: 'Fingerprint registered successfully',
      data: {
        id: fingerprintId,
        student_id,
        finger_position,
        hand,
        quality_score,
        status: 'active'
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('USB fingerprint registration error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to register fingerprint'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Link existing fingerprint from biometric machine
 */
async function linkExistingFingerprint(req: NextRequest) {
  let connection;
  try {
    const body = await req.json();
    const {
      student_id,
      device_id,
      biometric_uuid,
      finger_position = 'unknown',
      hand = 'right'
    } = body;

    if (!student_id || !device_id || !biometric_uuid) {
      return NextResponse.json({
        success: false,
        error: 'student_id, device_id, and biometric_uuid are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    const [result] = await connection.execute(
      `INSERT INTO student_fingerprints (
        school_id, student_id, device_id, finger_position, hand,
        biometric_uuid, status, is_active, created_at
      ) SELECT s.school_id, ?, ?, ?, ?, ?, 'active', 1, NOW()
      FROM students s WHERE s.id = ?`,
      [student_id, device_id, finger_position, hand, biometric_uuid, student_id]
    );

    return NextResponse.json({
      success: true,
      message: 'Fingerprint linked successfully',
      data: {
        id: (result as any).insertId,
        student_id,
        device_id,
        biometric_uuid,
        status: 'active'
      }
    }, { status: 201 });

  } catch (error: any) {
    console.error('Fingerprint linking error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to link fingerprint'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Verify fingerprint match
 */
async function verifyFingerprint(req: NextRequest) {
  let connection;
  try {
    const body = await req.json();
    const {
      student_id,
      device_id,
      template_data,
      confidence_threshold = 90
    } = body;

    if (!student_id || !template_data) {
      return NextResponse.json({
        success: false,
        error: 'student_id and template_data are required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Get student's fingerprints
    let query = `
      SELECT 
        id,
        template_data,
        quality_score,
        finger_position,
        biometric_uuid
      FROM student_fingerprints
      WHERE student_id = ? AND status = 'active'
    `;

    const params: any[] = [student_id];

    if (device_id) {
      query += ` AND device_id = ?`;
      params.push(device_id);
    }

    const [fingerprints] = await connection.execute(query, params);

    if (!Array.isArray(fingerprints) || fingerprints.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No active fingerprints found for this student',
        matched: false
      }, { status: 404 });
    }

    // In a real implementation, this would call a biometric matching algorithm
    // For now, we'll simulate a basic match (in production, use libraries like OpenFinger, NEC NeoFace, etc.)
    const match = {
      matched: true,
      fingerprint_id: (fingerprints[0] as any).id,
      confidence_score: 95,
      biometric_uuid: (fingerprints[0] as any).biometric_uuid
    };

    // Update last_matched timestamp
    await connection.execute(
      `UPDATE student_fingerprints 
       SET last_matched_at = NOW(), match_count = match_count + 1
       WHERE id = ?`,
      [match.fingerprint_id]
    );

    return NextResponse.json({
      success: true,
      data: match
    });

  } catch (error: any) {
    console.error('Fingerprint verification error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to verify fingerprint'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * Remove fingerprint
 */
async function removeFingerprint(req: NextRequest) {
  let connection;
  try {
    const body = await req.json();
    const { fingerprint_id } = body;

    if (!fingerprint_id) {
      return NextResponse.json({
        success: false,
        error: 'fingerprint_id is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    await connection.execute(
      `UPDATE student_fingerprints SET status = 'revoked', is_active = 0, updated_at = NOW()
       WHERE id = ?`,
      [fingerprint_id]
    );

    return NextResponse.json({
      success: true,
      message: 'Fingerprint removed successfully'
    });

  } catch (error: any) {
    console.error('Fingerprint removal error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to remove fingerprint'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
