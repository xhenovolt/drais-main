import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * POST /api/attendance/reconcile
 * Reconcile manual vs biometric attendance for a session
 */
export async function POST(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { attendance_session_id,
      reconciled_by } = body;

    if (!attendance_session_id) {
      return NextResponse.json({
        success: false,
        error: 'attendance_session_id is required'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Get session details
    const [sessions] = await connection.execute(
      'SELECT * FROM attendance_sessions WHERE id = ?',
      [attendance_session_id]
    );

    if (!Array.isArray(sessions) || sessions.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Attendance session not found'
      }, { status: 404 });
    }

    const attSession = (sessions[0] as any);

    // Get all attendance records for this session
    const [attendanceRecords] = await connection.execute(
      `SELECT 
        sa.id,
        sa.student_id,
        sa.status as manual_status,
        sa.method,
        sa.marked_by as manual_marked_by,
        sa.marked_at as manual_marked_at,
        sa.device_id,
        sa.confidence_score
      FROM student_attendance sa
      WHERE sa.attendance_session_id = ?
      ORDER BY sa.student_id`,
      [attendance_session_id]
    );

    if (!Array.isArray(attendanceRecords)) {
      return NextResponse.json({
        success: false,
        error: 'No attendance records found for session'
      }, { status: 404 });
    }

    let reconciliationCount = 0;
    let matchedCount = 0;
    let conflictCount = 0;

    // Process each record for reconciliation
    for (const record of attendanceRecords as any[]) {
      try {
        const manualStatus = record.manual_status;
        const method = record.method || 'manual';

        // Determine reconciliation status
        let reconciliationStatus = 'matched';
        let conflictResolution = null;

        if (method === 'biometric') {
          reconciliationStatus = 'biometric_only';
          conflictResolution = 'trust_biometric';
        } else if (method === 'manual') {
          // Check if there's also a biometric record
          const [biometricRecords] = await connection.execute(
            `SELECT id FROM student_attendance
             WHERE student_id = ? AND attendance_session_id = ? AND method = 'biometric'`,
            [record.student_id, attendance_session_id]
          );

          if (Array.isArray(biometricRecords) && biometricRecords.length > 0) {
            // Both manual and biometric exist - check if they match
            if (manualStatus === 'present') {
              reconciliationStatus = 'matched';
            } else {
              reconciliationStatus = 'conflict';
              conflictResolution = 'trust_biometric';  // Default preference
              conflictCount++;
            }
          } else {
            reconciliationStatus = 'manual_only';
          }
        }

        // Record reconciliation
        const [result] = await connection.execute(
          `INSERT INTO attendance_reconciliation (
            schoolId, attendance_session_id, student_id,
            manual_status, manual_marked_by, manual_marked_at,
            biometric_status, reconciliation_status, conflict_resolution,
            resolved_at, resolved_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, NOW(), ?, NOW())`,
          [
            schoolId,
            attendance_session_id,
            record.student_id,
            manualStatus !== 'not_marked' ? manualStatus : null,
            record.manual_marked_by,
            record.manual_marked_at,
            reconciliationStatus,
            conflictResolution || 'trust_biometric',
            reconciled_by
          ]
        );

        reconciliationCount++;
        if (reconciliationStatus === 'matched') {
          matchedCount++;
        }

      } catch (recordError: any) {
        console.error('Error reconciling record:', recordError);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Reconciliation completed: ${matchedCount}/${reconciliationCount} records matched`,
      data: {
        total_records: attendanceRecords.length,
        matched_count: matchedCount,
        conflict_count: conflictCount,
        reconciliation_percentage: Math.round((matchedCount / reconciliationCount) * 100)
      }
    });

  } catch (error: any) {
    console.error('Reconciliation error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to reconcile attendance'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

/**
 * GET /api/attendance/reconcile
 * View reconciliation report for a session
 */
export async function GET(req: NextRequest) {
  let connection;
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('session_id');
    // school_id derived from session below

    connection = await getConnection();

    let query = `
      SELECT 
        ar.id,
        ar.student_id,
        ar.manual_status,
        ar.biometric_status,
        ar.reconciliation_status,
        ar.conflict_resolution,
        ar.resolved_at,
        ar.resolution_notes,
        CONCAT(p.first_name, ' ', p.last_name) as student_name,
        p.photo_url
      FROM attendance_reconciliation ar
      LEFT JOIN students s ON ar.student_id = s.id
      LEFT JOIN people p ON s.person_id = p.id
      WHERE ar.school_id = ?
    `;

    const params: any[] = [schoolId];

    if (sessionId) {
      query += ` AND ar.attendance_session_id = ?`;
      params.push(sessionId);
    }

    query += ` ORDER BY ar.reconciliation_status DESC, p.last_name ASC`;

    const [rows] = await connection.execute(query, params);

    // Summary stats
    const [stats] = await connection.execute(
      `SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN reconciliation_status = 'matched' THEN 1 END) as matched,
        COUNT(CASE WHEN reconciliation_status = 'conflict' THEN 1 END) as conflicts,
        COUNT(CASE WHEN reconciliation_status = 'biometric_only' THEN 1 END) as biometric_only,
        COUNT(CASE WHEN reconciliation_status = 'manual_only' THEN 1 END) as manual_only
      FROM attendance_reconciliation
      WHERE school_id = ?` + (sessionId ? ` AND attendance_session_id = ?` : ''),
      params
    );

    return NextResponse.json({
      success: true,
      data: {
        records: rows || [],
        summary: (stats as any[])[0] || {}
      }
    });

  } catch (error: any) {
    console.error('Reconciliation fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch reconciliation data'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
