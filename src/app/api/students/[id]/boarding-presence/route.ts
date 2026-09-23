import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { checkAnyPermission } from '@/lib/rbac';
import { logAudit, AuditAction } from '@/lib/audit';
import { setBoardingPresence, getBoardingPresenceState } from '@/lib/attendance/boarding-presence';

const VALID_STATUSES = ['checked_in', 'on_leave'] as const;

/**
 * PATCH /api/students/:id/boarding-presence
 *
 * Check a boarding student in, or record a temporary leave (DRAIS Phase 4).
 * This is the explicit, authorized action behind "the school currently
 * assumes this student is residing at school" — never inferred from
 * biometric activity. Only takes effect for a school that has switched a
 * boarding-scoped attendance rule to boarding_presence_mode='continuous'
 * (see /api/attendance/settings); on 'daily' mode this state is recorded
 * but never consulted by the engine.
 *
 * Request: { "status": "checked_in" | "on_leave", "reason"?: string,
 *            "expected_return_date"?: "YYYY-MM-DD" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let conn;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const denied = await checkAnyPermission(session.userId, schoolId, ['academics.boarding_presence.manage'], session.isSuperAdmin);
    if (denied) return denied;

    const resolvedParams = await params;
    const studentId = parseInt(resolvedParams.id, 10);
    if (isNaN(studentId)) {
      return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
    }

    const body = await req.json();
    const { status, reason, expected_return_date } = body;
    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    if (status === 'on_leave' && !reason) {
      return NextResponse.json({ error: 'A reason is required to record a leave' }, { status: 400 });
    }

    conn = await getConnection();
    const [studentRows]: any = await conn.execute(
      `SELECT id, person_id, residency_status FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
      [studentId, schoolId],
    );
    if (!studentRows || studentRows.length === 0) {
      return NextResponse.json({ error: 'Student not found or access denied' }, { status: 404 });
    }
    const student = studentRows[0];
    if (student.residency_status !== 'boarding') {
      return NextResponse.json(
        { error: 'This student is not classified as boarding — set residency first (PATCH /api/students/:id/residency)' },
        { status: 409 },
      );
    }

    const previous = await setBoardingPresence({
      schoolId,
      studentId,
      personId: student.person_id,
      status,
      reason: reason ?? null,
      expectedReturnDate: expected_return_date ?? null,
      recordedBy: session.userId,
      source: 'manual',
    });

    void logAudit({
      schoolId,
      userId: session.userId,
      action: AuditAction.BOARDING_PRESENCE_CHANGED,
      entityType: 'student',
      entityId: studentId,
      details: {
        old: previous ? { status: previous.status, reason: previous.reason } : null,
        new: { status, reason: reason ?? null, expected_return_date: expected_return_date ?? null },
      },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
      userAgent: req.headers.get('user-agent'),
    });

    return NextResponse.json({ success: true, student_id: studentId, status, previous_status: previous?.status ?? null });
  } catch (error) {
    console.error('Error updating boarding presence:', error);
    return NextResponse.json({ error: 'Failed to update boarding presence' }, { status: 500 });
  } finally {
    if (conn) await conn.end();
  }
}

/** GET /api/students/:id/boarding-presence — current state. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  const resolvedParams = await params;
  const studentId = parseInt(resolvedParams.id, 10);
  if (isNaN(studentId)) {
    return NextResponse.json({ error: 'Invalid student ID' }, { status: 400 });
  }

  const state = await getBoardingPresenceState(schoolId, studentId);
  return NextResponse.json({ success: true, student_id: studentId, presence: state });
}
