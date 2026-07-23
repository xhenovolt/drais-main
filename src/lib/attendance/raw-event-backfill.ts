import { query } from '@/lib/db';

export interface BackfillAttendanceRawEventsInput {
  schoolId: number;
  deviceUserId: string;
  deviceSn?: string | null;
  studentId?: number | null;
  staffId?: number | null;
}

export interface BackfillAttendanceRawEventsResult {
  affectedDates: Date[];
  affectedRows: number;
}

/**
 * Retroactively stamps attendance_raw_events with the mapped person
 * identity so the historical logs table can keep showing the learner
 * or staff name even after the live device feed is gone.
 */
export async function backfillAttendanceRawEventsForMapping(
  input: BackfillAttendanceRawEventsInput,
): Promise<BackfillAttendanceRawEventsResult> {
  const deviceUserId = String(input.deviceUserId).trim();
  if (!deviceUserId) {
    return { affectedDates: [], affectedRows: 0 };
  }

  // role_ref_id = the staff/students ROW id; person_id = people.id.
  // (These are different tables — the old code wrote the row id into
  // person_id, which broke the `people` join for retro-assigned logs.)
  const mappedRefId = input.studentId ?? input.staffId ?? null;
  const mappedRoleType = input.studentId != null ? 'student' : input.staffId != null ? 'staff' : null;

  let mappedDisplayName: string | null = null;
  let mappedPersonId: number | null = null;
  if (input.studentId != null) {
    const rows = await query(
      `SELECT NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '') AS person_name,
              s.person_id
         FROM students s
         LEFT JOIN people p ON p.id = s.person_id
        WHERE s.id = ?
          AND s.school_id = ?
        LIMIT 1`,
      [input.studentId, input.schoolId],
    ) as Array<{ person_name: string | null; person_id: number | null }>;
    mappedDisplayName = rows[0]?.person_name ?? null;
    mappedPersonId = rows[0]?.person_id ?? null;
  } else if (input.staffId != null) {
    const rows = await query(
      `SELECT NULLIF(TRIM(CONCAT_WS(' ', p.first_name, p.last_name)), '') AS person_name,
              st.person_id
         FROM staff st
         LEFT JOIN people p ON p.id = st.person_id
        WHERE st.id = ?
          AND st.school_id = ?
        LIMIT 1`,
      [input.staffId, input.schoolId],
    ) as Array<{ person_name: string | null; person_id: number | null }>;
    mappedDisplayName = rows[0]?.person_name ?? null;
    mappedPersonId = rows[0]?.person_id ?? null;
  }

  if (mappedRefId == null || mappedPersonId == null || !mappedRoleType) {
    return { affectedDates: [], affectedRows: 0 };
  }

  const conditions = ['school_id = ?', 'CAST(device_user_id AS CHAR) = ?'];
  const whereParams: Array<string | number> = [input.schoolId, deviceUserId];
  if (input.deviceSn) {
    conditions.push('device_sn = ?');
    whereParams.push(input.deviceSn);
  }

  const where = conditions.join(' AND ');
  const result = await query(
    `UPDATE attendance_raw_events
        SET person_id = COALESCE(person_id, ?),
            role_type = COALESCE(role_type, ?),
            role_ref_id = COALESCE(role_ref_id, ?),
            display_name = COALESCE(NULLIF(display_name, ''), ?),
            matched = 1
      WHERE ${where}`,
    [mappedPersonId, mappedRoleType, mappedRefId, mappedDisplayName, ...whereParams],
  );

  const dateRows = await query(
    `SELECT DISTINCT DATE(punch_at) AS attendance_date
       FROM attendance_raw_events
      WHERE ${where}
        AND person_id = ?
      ORDER BY attendance_date ASC`,
    [...whereParams, mappedPersonId],
  ) as Array<{ attendance_date: string }>;

  return {
    affectedRows: Number((result as any)?.affectedRows || 0),
    affectedDates: dateRows
      .map((row) => row.attendance_date)
      .filter(Boolean)
      .map((date) => new Date(`${date}T00:00:00`)),
  };
}
