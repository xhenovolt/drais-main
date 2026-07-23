/**
 * Learner identity verification for pass-outs (Phase 4).
 *
 * A pass-out is never created (and the gate never decides) on a bare list
 * pick — identity is verified first, through one of:
 *
 *   fingerprint  device PIN → biometric_enrollments (role student). The
 *                gate's live fingerprint path already resolves this on-scan;
 *                this covers desk verification by PIN.
 *   card         Student ID = admission number (typed or scanned).
 *   manual       Name search → explicit student_id (permission-dependent —
 *                enforced by the API route, not here).
 *
 * Returns everything the operator needs to KNOW they have the right child:
 * photo, name, admission no, class/stream, gender, today's attendance,
 * guardian + phone, pass-out history, active pass, outstanding return.
 */
import { query } from '@/lib/db';

export interface VerifiedLearner {
  verified: true;
  method: 'fingerprint' | 'card' | 'manual';
  student: {
    id: number; person_id: number | null;
    name: string; admission_no: string | null;
    class_name: string | null; stream_name: string | null;
    gender: string | null; photo_url: string | null;
  };
  attendance_today: string | null;         // engine verdict (present/late/absent/…)
  guardian: { name: string | null; phone: string | null; relationship: string | null } | null;
  passout_history: Array<{
    id: number; passout_no: string | null; reason: string | null; status: string;
    actual_exit_at: string | null; actual_return_at: string | null; created_at: string;
  }>;
  total_passouts: number;
  active_passout: any | null;              // approved / used / overdue row
  outstanding_return: boolean;             // out and not yet back
}

export interface VerifyFailure { verified: false; reason: string; }

export async function verifyLearner(
  schoolId: number,
  q: { method: 'fingerprint' | 'card' | 'manual'; pin?: string | number; admission_no?: string; student_id?: number },
): Promise<VerifiedLearner | VerifyFailure> {
  let studentId: number | null = null;

  if (q.method === 'fingerprint') {
    const pin = parseInt(String(q.pin ?? ''), 10);
    if (!Number.isFinite(pin)) return { verified: false, reason: 'A device PIN is required for fingerprint verification' };
    const rows = (await query(
      `SELECT role_ref_id FROM biometric_enrollments
        WHERE school_id = ? AND role_type = 'student' AND pin_value = ?
          AND status IN ('active','pending_capture') LIMIT 1`,
      [schoolId, pin],
    )) as Array<{ role_ref_id: number }>;
    if (!rows[0]) return { verified: false, reason: `No learner is enrolled with fingerprint PIN ${pin}` };
    studentId = Number(rows[0].role_ref_id);
  } else if (q.method === 'card') {
    const adm = String(q.admission_no ?? '').trim();
    if (!adm) return { verified: false, reason: 'Student ID number is required' };
    const rows = (await query(
      `SELECT id FROM students WHERE school_id = ? AND admission_no = ? AND deleted_at IS NULL LIMIT 1`,
      [schoolId, adm],
    )) as Array<{ id: number }>;
    if (!rows[0]) return { verified: false, reason: `No learner with student ID "${adm}"` };
    studentId = Number(rows[0].id);
  } else {
    studentId = Number(q.student_id);
    if (!Number.isFinite(studentId)) return { verified: false, reason: 'student_id is required for manual verification' };
  }

  // ── Full learner panel ──
  const srows = (await query(
    `SELECT s.id, s.person_id, s.admission_no,
            TRIM(CONCAT_WS(' ', p.first_name, p.other_name, p.last_name)) AS name,
            p.gender, p.photo_url,
            c.name AS class_name, st.name AS stream_name
       FROM students s
       LEFT JOIN people p ON p.id = s.person_id
       LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
       LEFT JOIN classes c ON c.id = e.class_id
       LEFT JOIN streams st ON st.id = e.stream_id
      WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL
      LIMIT 1`,
    [studentId, schoolId],
  ).catch(async () =>
    // Schools without a streams table — same panel minus the stream.
    query(
      `SELECT s.id, s.person_id, s.admission_no,
              TRIM(CONCAT_WS(' ', p.first_name, p.other_name, p.last_name)) AS name,
              p.gender, p.photo_url, c.name AS class_name, NULL AS stream_name
         FROM students s
         LEFT JOIN people p ON p.id = s.person_id
         LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
         LEFT JOIN classes c ON c.id = e.class_id
        WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL LIMIT 1`,
      [studentId, schoolId],
    ),
  )) as any[];
  const s = srows[0];
  if (!s) return { verified: false, reason: 'Learner not found in this school' };

  const [attendance, guardian, history, active] = await Promise.all([
    query(
      `SELECT status FROM attendance_records
        WHERE school_id = ? AND person_id = ? AND role_type = 'student' AND attendance_date = CURDATE() LIMIT 1`,
      [schoolId, s.person_id],
    ).catch(() => []) as Promise<any[]>,
    query(
      `SELECT TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name, p.phone, sc.relationship
         FROM student_contacts sc
         JOIN contacts c ON c.id = sc.contact_id AND c.deleted_at IS NULL
         JOIN people p ON p.id = c.person_id
        WHERE sc.student_id = ?
        ORDER BY sc.is_primary DESC, sc.contact_id ASC LIMIT 1`,
      [studentId],
    ).catch(() => []) as Promise<any[]>,
    query(
      `SELECT id, passout_no, reason, status, actual_exit_at, actual_return_at, created_at
         FROM passout_requests
        WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL
        ORDER BY id DESC LIMIT 5`,
      [schoolId, studentId],
    ).catch(() => []) as Promise<any[]>,
    query(
      `SELECT * FROM passout_requests
        WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL
          AND status IN ('pending','approved','used','overdue')
        ORDER BY id DESC LIMIT 1`,
      [schoolId, studentId],
    ).catch(() => []) as Promise<any[]>,
  ]);

  const countRows = (await query(
    `SELECT COUNT(*) AS n FROM passout_requests WHERE school_id = ? AND student_id = ? AND deleted_at IS NULL`,
    [schoolId, studentId],
  ).catch(() => [{ n: history.length }])) as any[];

  const activeRow = active[0] ?? null;
  return {
    verified: true,
    method: q.method,
    student: {
      id: Number(s.id), person_id: s.person_id == null ? null : Number(s.person_id),
      name: s.name || '(no name)', admission_no: s.admission_no ?? null,
      class_name: s.class_name ?? null, stream_name: s.stream_name ?? null,
      gender: s.gender ?? null, photo_url: s.photo_url ?? null,
    },
    attendance_today: attendance[0]?.status ?? null,
    guardian: guardian[0]
      ? { name: guardian[0].name || null, phone: guardian[0].phone || null, relationship: guardian[0].relationship || null }
      : null,
    passout_history: history,
    total_passouts: Number(countRows[0]?.n || 0),
    active_passout: activeRow,
    outstanding_return: !!activeRow && (activeRow.status === 'used' || activeRow.status === 'overdue'),
  };
}
