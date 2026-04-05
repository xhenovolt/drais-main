import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

function safe(v: any) { return (v === undefined || v === '') ? null : v; }

// POST - Capture and store fingerprint
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;
  try {
    const resolvedParams = await params;
    const studentId = parseInt(resolvedParams.id, 10);
    if (isNaN(studentId)) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    const body = await request.json();
    const { fingerprintData, deviceInfo, method } = body;

    if (!fingerprintData) {
      return NextResponse.json({ error: 'Fingerprint data is required' }, { status: 400 });
    }

    connection = await getConnection();

    // Check if student exists
    const [student] = await connection.execute(
      'SELECT id FROM students WHERE id = ?',
      [studentId]
    );

    if (!Array.isArray(student) || student.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Create or update fingerprint record
    const [existing] = await connection.execute(
      'SELECT id FROM fingerprints WHERE student_id = ? AND method = ?',
      [studentId, method || 'device']
    );

    let result;
    if (Array.isArray(existing) && existing.length > 0) {
      // Update existing fingerprint
      await connection.execute(
        'UPDATE fingerprints SET credential = ?, updated_at = NOW() WHERE id = ?',
        [fingerprintData, existing[0].id]
      );
      result = { id: existing[0].id, updated: true };
    } else {
      // Insert new fingerprint
      const [insertResult] = await connection.execute(
        'INSERT INTO fingerprints (student_id, method, credential, created_at) VALUES (?, ?, ?, NOW())',
        [studentId, method || 'device', fingerprintData]
      );
      result = { id: (insertResult as any).insertId, created: true };
    }

    // Log the capture event
    await connection.execute(
      'INSERT INTO audit_logs (action, table_name, record_id, user_id, new_values, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [
        'CAPTURE_FINGERPRINT',
        'fingerprints',
        studentId.toString(),
        1, // Demo user ID
        JSON.stringify({
          method: method || 'device',
          deviceInfo: deviceInfo || null,
          timestamp: new Date(),
          dataSize: fingerprintData.length
        })
      ]
    );

    return NextResponse.json({
      success: true,
      message: result.updated ? 'Fingerprint updated successfully' : 'Fingerprint captured and stored successfully',
      data: {
        id: result.id,
        method: method || 'device',
        timestamp: new Date()
      }
    });

  } catch (error: any) {
    console.error('Fingerprint capture error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to capture fingerprint',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
}
