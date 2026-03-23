import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const resolvedParams = await params;
    const studentId = resolvedParams.id;
    connection = await getConnection();

    const [result] = await connection.execute(
      'SELECT id, is_active, created_at, updated_at FROM student_fingerprints WHERE student_id = ? AND is_active = 1',
      [studentId]
    );

    const hasFingerprint = Array.isArray(result) && result.length > 0;

    return NextResponse.json({
      success: true,
      data: {
        hasFingerprint,
        hasPhone: hasFingerprint,
        hasBiometric: hasFingerprint,
        fingerprint: hasFingerprint ? result[0] : null
      }
    });

  } catch (error: any) {
    console.error('Fingerprint check error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to check fingerprint status'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const resolvedParams = await params;
    const studentId = resolvedParams.id;
    const body = await req.json();
    const { finger_position = 'unknown', hand = 'right', template_format = 'passkey', biometric_uuid, quality_score = 0, notes = 'Passkey-based authentication' } = body;

    connection = await getConnection();

    // Check if student exists
    const [studentCheck] = await connection.execute(
      'SELECT id FROM students WHERE id = ?',
      [studentId]
    );

    if (!Array.isArray(studentCheck) || studentCheck.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Student not found'
      }, { status: 404 });
    }

    // Insert fingerprint record
    await connection.execute(
      `INSERT INTO student_fingerprints 
       (student_id, finger_position, hand, template_format, biometric_uuid, quality_score, is_active, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'active', ?)`,
      [studentId, finger_position, hand, template_format, biometric_uuid || null, quality_score, notes]
    );

    return NextResponse.json({
      success: true,
      message: 'Fingerprint registered successfully'
    });

  } catch (error: any) {
    console.error('Fingerprint registration error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to register fingerprint'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const resolvedParams = await params;
    const studentId = resolvedParams.id;
    connection = await getConnection();

    await connection.execute(
      'UPDATE student_fingerprints SET is_active = 0 WHERE student_id = ?',
      [studentId]
    );

    return NextResponse.json({
      success: true,
      message: 'Fingerprint deactivated successfully'
    });

  } catch (error: any) {
    console.error('Fingerprint deletion error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to deactivate fingerprint'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
