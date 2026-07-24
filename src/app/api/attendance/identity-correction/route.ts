/**
 * Identity Correction API (hardening Part 2/3/8).
 *
 * POST { device_user_id | enrollment_id, new_role, new_ref_id, reason }
 *   → correct a WRONG identity mapping. Events are preserved; the mapping
 *     moves to the right person (history-first), historical events are
 *     re-attributed, both people's verdicts re-evaluated, all audited.
 *
 * POST { action:'create_and_assign', device_user_id, role, name, ... }
 *   → create a new staff/learner AND map this PIN to them, from the
 *     attendance context (Part 3), without leaving the screen.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { applyCorrection, planCorrection } from '@/lib/biometric/identity-correction';

export const runtime = 'nodejs';

async function enrollmentFor(schoolId: number, body: any): Promise<any | null> {
  if (body.enrollment_id) {
    const r = (await query(`SELECT id, person_id, role_type, role_ref_id, pin_value, origin_device_sn FROM biometric_enrollments WHERE id = ? AND school_id = ? LIMIT 1`, [Number(body.enrollment_id), schoolId])) as any[];
    return r[0] ?? null;
  }
  if (body.device_user_id != null) {
    const r = (await query(
      `SELECT id, person_id, role_type, role_ref_id, pin_value, origin_device_sn
         FROM biometric_enrollments
        WHERE school_id = ? AND pin_value = ? AND status IN ('active','pending_capture')
        ORDER BY id DESC LIMIT 1`,
      [schoolId, parseInt(String(body.device_user_id), 10)],
    )) as any[];
    return r[0] ?? null;
  }
  return null;
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'attendance.manage', session.isSuperAdmin);
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  try {
    // ── Create a new person and map this PIN to them (Part 3) ──
    if (body.action === 'create_and_assign') {
      const role = body.role === 'student' ? 'student' : 'staff';
      const name = String(body.name || '').trim();
      if (!name || body.device_user_id == null) return NextResponse.json({ error: 'name and device_user_id are required' }, { status: 400 });
      const [first, ...rest] = name.split(/\s+/);
      const last = rest.join(' ') || first;

      // Create person + role row.
      const personRes = (await query(
        `INSERT INTO people (school_id, first_name, last_name, gender) VALUES (?, ?, ?, ?)`,
        [session.schoolId, first, last, body.gender || null],
      )) as any;
      const personId = personRes.insertId;
      let refId: number;
      if (role === 'staff') {
        const r = (await query(
          `INSERT INTO staff (school_id, person_id, staff_no, position, status) VALUES (?, ?, ?, ?, 'active')`,
          [session.schoolId, personId, `STAFF${Date.now()}`, body.position || 'Staff'],
        )) as any;
        refId = r.insertId;
      } else {
        const r = (await query(
          `INSERT INTO students (school_id, person_id, admission_no, status) VALUES (?, ?, ?, 'active')`,
          [session.schoolId, personId, body.admission_no || `ADM${Date.now()}`],
        )) as any;
        refId = r.insertId;
      }

      // Map the PIN to the new person (creates or corrects the enrollment).
      const existing = await enrollmentFor(session.schoolId, body);
      if (existing) {
        const r = await applyCorrection({
          schoolId: session.schoolId, enrollmentId: existing.id,
          newRoleType: role, newRoleRefId: refId,
          reason: `created ${role} from attendance`, actorUserId: session.userId,
        });
        return NextResponse.json({ success: true, created: { person_id: personId, role, ref_id: refId }, ...r });
      }
      // No enrollment yet → create + backfill via the existing mapping path.
      const { backfillAttendanceRawEventsForMapping } = await import('@/lib/attendance/raw-event-backfill');
      await query(
        `INSERT INTO biometric_enrollments (school_id, person_id, role_type, role_ref_id, pin_value, status, enrolled_by, source)
         VALUES (?, ?, ?, ?, ?, 'active', ?, 'attendance-create')
         ON DUPLICATE KEY UPDATE person_id=VALUES(person_id), role_type=VALUES(role_type), role_ref_id=VALUES(role_ref_id), status='active'`,
        [session.schoolId, personId, role, refId, parseInt(String(body.device_user_id), 10), session.userId],
      ).catch(() => {});
      const bf = await backfillAttendanceRawEventsForMapping({
        schoolId: session.schoolId, deviceUserId: String(body.device_user_id),
        studentId: role === 'student' ? refId : null, staffId: role === 'staff' ? refId : null,
      });
      return NextResponse.json({ success: true, created: { person_id: personId, role, ref_id: refId }, eventsReattributed: bf.affectedRows });
    }

    // ── Correct an existing mapping (Part 2) ──
    const enr = await enrollmentFor(session.schoolId, body);
    const newRole = body.new_role === 'student' ? 'student' : 'staff';
    const newRefId = Number(body.new_ref_id);
    const roleTable = newRole === 'student' ? 'students' : 'staff';
    const target = (await query(`SELECT person_id FROM ${roleTable} WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`, [newRefId, session.schoolId])) as any[];

    const plan = planCorrection(
      enr ? { enrollment_id: enr.id, person_id: enr.person_id, role_type: enr.role_type, role_ref_id: enr.role_ref_id, pin_value: enr.pin_value } : null,
      { role_type: newRole, role_ref_id: newRefId, person_id: target[0]?.person_id ?? null },
    );
    if (!plan.ok) return NextResponse.json({ error: plan.reason }, { status: 400 });

    const result = await applyCorrection({
      schoolId: session.schoolId, enrollmentId: enr.id,
      newRoleType: newRole, newRoleRefId: newRefId,
      reason: body.reason ?? null, actorUserId: session.userId,
    });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 409 });
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Correction failed' }, { status: 500 });
  }
}
