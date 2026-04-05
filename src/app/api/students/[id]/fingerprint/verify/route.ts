import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

function safe(v: any) { return (v === undefined || v === '') ? null : v; }

// Helper function to validate authentication
async function validateAuth(request: NextRequest) {
  // Add your authentication logic here
  return true;
}

// Helper function to verify WebAuthn credential
async function verifyWebAuthnCredential(storedCredential: string, challenge: string): Promise<boolean> {
  try {
    // This is a simplified verification - in production, use a proper WebAuthn library
    // like @simplewebauthn/server for full verification
    const stored = JSON.parse(storedCredential);
    const provided = JSON.parse(challenge);
    
    // Basic comparison - replace with proper WebAuthn verification
    return stored.id === provided.id;
  } catch (error) {
    console.error('WebAuthn verification error:', error);
    return false;
  }
}

// GET - Verify fingerprint
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;
  try {
    if (!await validateAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const studentId = parseInt(resolvedParams.id, 10);
    if (isNaN(studentId)) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const method = searchParams.get('method');
    const challenge = searchParams.get('challenge');

    if (!method || !['phone', 'biometric'].includes(method)) {
      return NextResponse.json({ error: 'Invalid method parameter' }, { status: 400 });
    }

    if (!challenge) {
      return NextResponse.json({ error: 'Challenge parameter is required' }, { status: 400 });
    }

    connection = await getConnection();

    const [fingerprint] = await connection.execute(
      'SELECT id, credential FROM fingerprints WHERE student_id = ? AND method = ?',
      [studentId, method]
    );

    if (!Array.isArray(fingerprint) || fingerprint.length === 0) {
      return NextResponse.json({ 
        success: false,
        error: 'Fingerprint not registered for this method' 
      }, { status: 404 });
    }

    const isValid = await verifyWebAuthnCredential(fingerprint[0].credential, challenge);

    // Log verification attempt
    await connection.execute(
      'INSERT INTO audit_logs (action, table_name, record_id, user_id, new_values, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [
        'VERIFY_FINGERPRINT',
        'fingerprints',
        studentId.toString(),
        1,
        JSON.stringify({
          method,
          result: isValid ? 'success' : 'failed',
          timestamp: new Date()
        })
      ]
    );

    return NextResponse.json({
      success: isValid,
      message: isValid ? 'Fingerprint verified successfully' : 'Fingerprint verification failed',
      data: {
        verified: isValid,
        method,
        timestamp: new Date()
      }
    });
  } catch (error: any) {
    console.error('Fingerprint verification error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to verify fingerprint',
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

// POST - Verify with challenge-response
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;
  try {
    if (!await validateAuth(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const studentId = parseInt(resolvedParams.id, 10);
    if (isNaN(studentId)) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    const body = await request.json();
    const { method, credential } = body;

    if (!method || !['phone', 'biometric'].includes(method)) {
      return NextResponse.json({ error: 'Invalid method' }, { status: 400 });
    }

    if (!credential) {
      return NextResponse.json({ error: 'Credential is required' }, { status: 400 });
    }

    connection = await getConnection();

    const [storedFingerprint] = await connection.execute(
      'SELECT id, credential FROM fingerprints WHERE student_id = ? AND method = ?',
      [studentId, method]
    );

    if (!Array.isArray(storedFingerprint) || storedFingerprint.length === 0) {
      return NextResponse.json({ 
        success: false,
        error: 'Fingerprint not registered for this method' 
      }, { status: 404 });
    }

    const isValid = await verifyWebAuthnCredential(storedFingerprint[0].credential, credential);

    // Log verification attempt
    await connection.execute(
      'INSERT INTO audit_logs (action, table_name, record_id, user_id, new_values, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [
        'VERIFY_FINGERPRINT',
        'fingerprints',
        studentId.toString(),
        1,
        JSON.stringify({
          method,
          result: isValid ? 'success' : 'failed',
          timestamp: new Date()
        })
      ]
    );

    return NextResponse.json({
      success: isValid,
      message: isValid ? 'Fingerprint verified successfully' : 'Fingerprint verification failed',
      data: {
        verified: isValid,
        method,
        timestamp: new Date()
      }
    });
  } catch (error: any) {
    console.error('Fingerprint verification error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to verify fingerprint',
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
