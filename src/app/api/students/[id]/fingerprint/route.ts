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

    // Tenant isolation + deleted_at: previously scoped by student_id alone,
    // which let any authenticated session query fingerprint status for a
    // student in ANY school if the id was known/guessed.
    const [result] = await connection.execute(
      `SELECT sf.id, sf.is_active, sf.created_at, sf.updated_at
         FROM student_fingerprints sf
         JOIN students s ON s.id = sf.student_id
        WHERE sf.student_id = ? AND sf.is_active = 1 AND s.school_id = ? AND s.deleted_at IS NULL`,
      [studentId, schoolId]
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

    // Check if student exists — tenant-scoped: a bare `WHERE id = ?` here
    // previously let any authenticated session enroll a fingerprint
    // against a student_id belonging to a DIFFERENT school if the id was
    // known/guessed. schoolId was already derived from session above but
    // never actually used in this query.
    const [studentCheck] = await connection.execute(
      'SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
      [studentId, schoolId]
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
