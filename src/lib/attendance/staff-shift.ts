/**
 * Server-side bridge: resolve the shift that applies to a staff member on a
 * date, using the pure resolveShift precedence engine over shift_assignments.
 * Returns null when the school has no matching shift assignment — in which case
 * every caller falls back to its existing (pre-shift) behaviour unchanged, so
 * shifts are strictly opt-in per school.
 */
import { query } from '@/lib/db';
import { resolveShift, type Shift, type ShiftAssignment } from './shifts';

/** 'YYYY-MM-DD' for a Date (UTC-stable). */
function iso(d: Date): string { return new Date(d).toISOString().slice(0, 10); }

export async function loadResolvedStaffShift(
  schoolId: number,
  personId: number,
  date: Date,
): Promise<Shift | null> {
  // Staff row → staff.id + department/role for assignment matching.
  const staffRows = (await query(
    `SELECT id, department_id, role_id FROM staff
      WHERE person_id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1`,
    [personId, schoolId],
  )) as Array<{ id: number; department_id: number | null; role_id: number | null }>;
  const staff = staffRows[0];
  if (!staff) return null;

  // Candidate assignments for this staff's targets (staff / dept / role / school).
  const rawAssignments = (await query(
    `SELECT shift_id, target_type, target_id, effective_from, effective_to, status
       FROM shift_assignments
      WHERE school_id = ? AND (status IS NULL OR status = 'active')
        AND (
          (target_type = 'staff'      AND target_id = ?) OR
          (target_type = 'department' AND target_id = ?) OR
          (target_type = 'role'       AND target_id = ?) OR
          (target_type = 'school')
        )`,
    [schoolId, staff.id, staff.department_id, staff.role_id],
  )) as Array<Record<string, any>>;
  if (!rawAssignments.length) return null;

  const shiftIds = [...new Set(rawAssignments.map(a => Number(a.shift_id)))];
  const shiftRows = (await query(
    `SELECT id, name, start_time, end_time, arrival_window_minutes, late_threshold_minutes,
            early_leave_threshold_minutes, overtime_after_minutes, weekday_mask
       FROM shifts
      WHERE id IN (${shiftIds.map(() => '?').join(',')}) AND status = 'active'`,
    shiftIds,
  )) as Array<Record<string, any>>;

  const shiftsById: Record<number, Shift> = {};
  for (const r of shiftRows) {
    shiftsById[Number(r.id)] = {
      id: Number(r.id), name: r.name,
      startTime: String(r.start_time), endTime: String(r.end_time),
      arrivalWindowMinutes: Number(r.arrival_window_minutes),
      lateThresholdMinutes: Number(r.late_threshold_minutes),
      earlyLeaveThresholdMinutes: Number(r.early_leave_threshold_minutes),
      overtimeAfterMinutes: r.overtime_after_minutes == null ? null : Number(r.overtime_after_minutes),
      weekdayMask: Number(r.weekday_mask),
    };
  }

  const assignments: ShiftAssignment[] = rawAssignments.map(a => ({
    shiftId: Number(a.shift_id),
    targetType: a.target_type,
    targetId: a.target_id == null ? null : Number(a.target_id),
    effectiveFrom: a.effective_from ? String(a.effective_from).slice(0, 10) : null,
    effectiveTo: a.effective_to ? String(a.effective_to).slice(0, 10) : null,
    status: a.status,
  }));

  return resolveShift({
    assignments, shiftsById,
    staffId: staff.id, departmentId: staff.department_id, roleId: staff.role_id,
    onDate: iso(date),
  });
}
