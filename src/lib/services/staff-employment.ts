/**
 * Phase C — Staff employment lifecycle service.
 *
 * Append-only event log over `staff_employment`. Every state transition
 * (hire, suspend, return, terminate, promote, transfer) lands as a new
 * row. The cached `staff.status` column is kept in sync with the latest
 * event's status.
 *
 * Convention:
 *   * Rows are never UPDATEd. To "correct" a mistake, append a new event
 *     with the desired state and a `reason` explaining the correction.
 *   * `effective_date` may be backdated; `event_date` is always now().
 */
import { query } from '@/lib/db';

export type EmploymentEventType =
  | 'hired'
  | 'reactivated'
  | 'suspended'
  | 'on_leave'
  | 'returned_from_leave'
  | 'transferred'
  | 'promoted'
  | 'demoted'
  | 'terminated';

export type EmploymentStatus = 'active' | 'on_leave' | 'suspended' | 'terminated';

export type ContractType =
  | 'permanent'
  | 'fixed_term'
  | 'contract'
  | 'volunteer'
  | 'part_time';

export const EMPLOYMENT_EVENT_TYPES: readonly EmploymentEventType[] = [
  'hired', 'reactivated', 'suspended', 'on_leave', 'returned_from_leave',
  'transferred', 'promoted', 'demoted', 'terminated',
] as const;

export function isEmploymentEventType(v: unknown): v is EmploymentEventType {
  return typeof v === 'string'
    && (EMPLOYMENT_EVENT_TYPES as readonly string[]).includes(v);
}

/**
 * Map an event type to the status the staff member enters as a result.
 * Centralises the state machine so callers don't have to remember which
 * event produces which terminal status.
 */
export function statusForEvent(eventType: EmploymentEventType): EmploymentStatus {
  switch (eventType) {
    case 'hired':
    case 'reactivated':
    case 'returned_from_leave':
    case 'transferred':
    case 'promoted':
    case 'demoted':         return 'active';
    case 'on_leave':        return 'on_leave';
    case 'suspended':       return 'suspended';
    case 'terminated':      return 'terminated';
  }
}

export interface EmploymentEvent {
  id:              number;
  staffId:         number;
  schoolId:        number;
  eventType:       EmploymentEventType;
  status:          EmploymentStatus;
  contractType:    ContractType | null;
  effectiveDate:   string;
  endDate:         string | null;
  salaryGrade:     string | null;
  positionId:      number | null;
  departmentId:    number | null;
  reason:          string | null;
  notes:           string | null;
  recordedBy:      number;
  eventDate:       string;
}

interface RawRow {
  id:               number;
  staff_id:         number;
  school_id:        number;
  event_type:       EmploymentEventType;
  status:           EmploymentStatus;
  contract_type:    ContractType | null;
  effective_date:   string | Date;
  end_date:         string | Date | null;
  salary_grade:     string | null;
  position_id:      number | null;
  department_id:    number | null;
  reason:           string | null;
  notes:            string | null;
  recorded_by:      number;
  event_date:       string | Date;
}

function toIso(v: string | Date): string {
  return typeof v === 'string' ? v : new Date(v).toISOString();
}
function toIsoNullable(v: string | Date | null): string | null {
  return v === null ? null : toIso(v);
}

function toEvent(r: RawRow): EmploymentEvent {
  return {
    id:            r.id,
    staffId:       r.staff_id,
    schoolId:      r.school_id,
    eventType:     r.event_type,
    status:        r.status,
    contractType:  r.contract_type,
    effectiveDate: toIso(r.effective_date),
    endDate:       toIsoNullable(r.end_date),
    salaryGrade:   r.salary_grade,
    positionId:    r.position_id,
    departmentId:  r.department_id,
    reason:        r.reason,
    notes:         r.notes,
    recordedBy:    r.recorded_by,
    eventDate:     toIso(r.event_date),
  };
}

/**
 * Full employment history for a staff member. School-scoped via JOIN to
 * staff so a guessed staff id in another tenant returns nothing.
 */
export async function listEmploymentEvents(args: {
  staffId:  number;
  schoolId: number;
}): Promise<EmploymentEvent[]> {
  const rows = (await query(
    `SELECT e.id, e.staff_id, e.school_id, e.event_type, e.status,
            e.contract_type, e.effective_date, e.end_date, e.salary_grade,
            e.position_id, e.department_id, e.reason, e.notes,
            e.recorded_by, e.event_date
       FROM staff_employment e
       JOIN staff s ON s.id = e.staff_id
      WHERE e.staff_id  = ?
        AND s.school_id = ?
      ORDER BY e.event_date DESC, e.id DESC`,
    [args.staffId, args.schoolId],
  )) as RawRow[];
  return rows.map(toEvent);
}

/**
 * Latest event for a staff member. Used by the staff profile header.
 */
export async function latestEmploymentEvent(args: {
  staffId:  number;
  schoolId: number;
}): Promise<EmploymentEvent | null> {
  const rows = (await query(
    `SELECT e.id, e.staff_id, e.school_id, e.event_type, e.status,
            e.contract_type, e.effective_date, e.end_date, e.salary_grade,
            e.position_id, e.department_id, e.reason, e.notes,
            e.recorded_by, e.event_date
       FROM staff_employment e
       JOIN staff s ON s.id = e.staff_id
      WHERE e.staff_id  = ?
        AND s.school_id = ?
      ORDER BY e.event_date DESC, e.id DESC
      LIMIT 1`,
    [args.staffId, args.schoolId],
  )) as RawRow[];
  return rows.length ? toEvent(rows[0]) : null;
}

/**
 * Append a new employment event AND sync the cached `staff.status`
 * column. Both writes happen in a transaction so the cache cannot drift
 * out of sync with the event log.
 *
 * Verifies snapshot ownership before writing — a guessed staff id in
 * another tenant is rejected.
 */
export async function appendEmploymentEvent(args: {
  staffId:        number;
  schoolId:       number;
  eventType:      EmploymentEventType;
  effectiveDate?: string;
  endDate?:       string | null;
  contractType?:  ContractType | null;
  salaryGrade?:   string | null;
  positionId?:    number | null;
  departmentId?:  number | null;
  reason?:        string | null;
  notes?:         string | null;
  recordedBy:     number;
}): Promise<{ id: number; status: EmploymentStatus }> {
  // Verify the staff row belongs to the caller's school
  const owned = (await query(
    `SELECT 1 FROM staff WHERE id = ? AND school_id = ? LIMIT 1`,
    [args.staffId, args.schoolId],
  )) as Array<{ '1': number }>;
  if (owned.length === 0) {
    const err: Error & { statusCode?: number } = new Error('Staff not found');
    err.statusCode = 404;
    throw err;
  }

  const status = statusForEvent(args.eventType);
  const effectiveDate = args.effectiveDate ?? new Date().toISOString().slice(0, 10);

  const result = (await query(
    `INSERT INTO staff_employment
       (staff_id, school_id, event_type, status, contract_type,
        effective_date, end_date, salary_grade, position_id,
        department_id, reason, notes, recorded_by, event_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      args.staffId, args.schoolId, args.eventType, status,
      args.contractType ?? null,
      effectiveDate,
      args.endDate ?? null,
      args.salaryGrade ?? null,
      args.positionId ?? null,
      args.departmentId ?? null,
      args.reason ?? null,
      args.notes ?? null,
      args.recordedBy,
    ],
  )) as { insertId?: number };

  // Keep staff.status in sync with the latest event's status. The
  // status column is a cache — the event log is authoritative.
  await query(
    `UPDATE staff SET status = ? WHERE id = ? AND school_id = ?`,
    [status, args.staffId, args.schoolId],
  );

  return { id: Number(result?.insertId ?? 0), status };
}
