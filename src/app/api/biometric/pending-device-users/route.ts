/**
 * Phase 1E — pending device user triage API.
 *
 * GET  /api/biometric/pending-device-users
 *        ?status=pending|ambiguous|all (default: unresolved)
 *      → rows the device knows but DRAIS could not deterministically
 *        map: device_sn, PIN, device name, candidate suggestions.
 *
 * POST /api/biometric/pending-device-users
 *      { id, action: 'map',        user_type, student_id | staff_id }
 *      { id, action: 'ignore' }
 *      { id, action: 'quarantine' }
 *      → 'map' goes through the enrollment service (canonical row +
 *        legacy mirror), retro-matches prior unmatched punches, and
 *        re-runs day classification — same semantics as the manual
 *        mapping screen. 'Create learner/staff' is done via the normal
 *        admissions/staff flows first, then 'map' here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { upsertEnrollment } from '@/lib/biometric/enrollment-service';
import {
  ensurePendingDeviceUsersSchema,
  markPendingResolved,
} from '@/lib/biometric/pending-device-users';
import { backfillAttendanceRawEventsForMapping } from '@/lib/attendance/raw-event-backfill';
import { evaluateDay } from '@/lib/attendance/engine';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get('status') || 'unresolved';
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') || '100', 10)));

  try {
    await ensurePendingDeviceUsersSchema();
    const where: string[] = ['school_id = ?'];
    const params: unknown[] = [session.schoolId];
    if (status === 'unresolved') {
      where.push(`status IN ('pending','ambiguous')`);
    } else if (status !== 'all') {
      where.push('status = ?');
      params.push(status);
    }
    const rows = await query(
      `SELECT id, device_sn, device_user_pin, device_name, device_card,
              status, reason, candidates_json, first_seen, last_seen,
              resolved_by, resolved_at, resolved_enrollment_id
         FROM pending_device_users
        WHERE ${where.join(' AND ')}
        ORDER BY last_seen DESC
        LIMIT ${limit}`,
      params,
    );
    const data = (rows || []).map((r: any) => ({
      ...r,
      candidates: safeParse(r.candidates_json),
      candidates_json: undefined,
    }));
    return NextResponse.json({ success: true, data, total: data.length });
  } catch (err) {
    console.error('[pending-device-users GET]', err);
    return NextResponse.json({ error: 'Failed to load pending device users' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { id, action } = body;
  if (!id || !['map', 'ignore', 'quarantine'].includes(action)) {
    return NextResponse.json({ error: "id and action ('map'|'ignore'|'quarantine') required" }, { status: 400 });
  }

  try {
    await ensurePendingDeviceUsersSchema();
    const rows = await query(
      `SELECT id, device_sn, device_user_pin, device_name, status
         FROM pending_device_users
        WHERE id = ? AND school_id = ?
        LIMIT 1`,
      [id, session.schoolId],
    );
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Pending device user not found' }, { status: 404 });
    }
    const row = rows[0];
    const userId = (session as { userId?: number }).userId ?? null;

    if (action === 'ignore' || action === 'quarantine') {
      await markPendingResolved(
        session.schoolId, row.device_sn, row.device_user_pin,
        action === 'ignore' ? 'ignored' : 'quarantined', userId,
      );
      return NextResponse.json({ success: true, message: `Device user ${action}d` });
    }

    // action === 'map'
    const userType = body.user_type as 'student' | 'staff';
    const refId = userType === 'student' ? Number(body.student_id) : Number(body.staff_id);
    if (!['student', 'staff'].includes(userType) || !refId) {
      return NextResponse.json({ error: 'user_type and student_id/staff_id required for map' }, { status: 400 });
    }

    const pin = Number(row.device_user_pin);
    if (!Number.isFinite(pin) || pin <= 0 || pin > 65535) {
      return NextResponse.json({ error: `Device PIN '${row.device_user_pin}' is not a valid numeric PIN` }, { status: 422 });
    }

    const enrollment = await upsertEnrollment({
      schoolId: session.schoolId,
      roleType: userType,
      roleRefId: refId,
      pin,
      deviceSn: row.device_sn,
      source: 'pending_device_user_resolution',
      enrolledBy: userId,
    });
    if (!enrollment.ok) {
      return NextResponse.json({
        error: enrollment.reason === 'pin_conflict'
          ? `PIN ${pin} is actively mapped to another person. Unmap them first.`
          : `Mapping rejected: ${enrollment.reason}${enrollment.detail ? ` (${enrollment.detail})` : ''}`,
      }, { status: 409 });
    }

    // Retro-match prior unmatched punches + re-run classification —
    // same behavior as the manual mapping screen.
    let rematched = 0;
    try {
      const rematch = await query(
        `UPDATE zk_attendance_logs
            SET student_id = ?, staff_id = ?, matched = 1
          WHERE school_id = ? AND device_user_id = ? AND matched = 0`,
        [userType === 'student' ? refId : null,
         userType === 'staff' ? refId : null,
         session.schoolId, String(row.device_user_pin)],
      );
      rematched = (rematch as any)?.affectedRows || 0;
    } catch (err) {
      console.warn('[pending-device-users] rematch failed:', err);
    }
    try {
      const backfill = await backfillAttendanceRawEventsForMapping({
        schoolId: session.schoolId,
        deviceUserId: String(row.device_user_pin),
        deviceSn: row.device_sn,
        studentId: userType === 'student' ? refId : null,
        staffId: userType === 'staff' ? refId : null,
      });
      if (enrollment.personId && backfill.affectedDates.length > 0) {
        for (const d of backfill.affectedDates) {
          await evaluateDay(session.schoolId, Number(enrollment.personId), userType, d);
        }
      }
    } catch (err) {
      console.warn('[pending-device-users] raw event backfill failed:', err);
    }

    await markPendingResolved(
      session.schoolId, row.device_sn, row.device_user_pin,
      'mapped', userId, enrollment.enrollmentId ?? null,
    );

    return NextResponse.json({
      success: true,
      message: `Mapped device PIN ${pin} to ${userType} #${refId}${rematched > 0 ? `. ${rematched} prior punches re-matched.` : ''}`,
      enrollment_id: enrollment.enrollmentId,
      rematched,
    });
  } catch (err) {
    console.error('[pending-device-users POST]', err);
    return NextResponse.json({ error: 'Failed to resolve pending device user' }, { status: 500 });
  }
}

function safeParse(json: string | null): unknown {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}
