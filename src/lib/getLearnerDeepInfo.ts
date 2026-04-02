import { query } from '@/lib/db';

export interface LearnerDeepInfo {
  student_id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  class_name: string | null;
  stream_name: string | null;
  student_status: string;
  enrollment_status: string | null;
  fee_balance: number;
  attendance_today: number;
  guardian: {
    name: string;
    phone: string;
    relationship: string;
  } | null;
}

/**
 * Fetch deep learner info for identity popup.
 * Works for ALL students — enrolled OR just admitted.
 * Uses COALESCE to fall back to students.class_id when no active enrollment exists.
 */
export async function getLearnerDeepInfo(studentId: number): Promise<LearnerDeepInfo | null> {
  // Main student info + optional enrollment + guardian (single query)
  const rows = await query(
    `SELECT
       s.id AS student_id,
       s.admission_no,
       s.status AS student_status,
       sp.first_name,
       sp.last_name,
       sp.photo_url,
       e.status AS enrollment_status,
       COALESCE(c.name, c2.name) AS class_name,
       str.name AS stream_name,
       cp.first_name AS guardian_first_name,
       cp.last_name AS guardian_last_name,
       cp.phone AS guardian_phone,
       sc.relationship
     FROM students s
     LEFT JOIN people sp ON s.person_id = sp.id
     LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
     LEFT JOIN classes c ON e.class_id = c.id
     LEFT JOIN classes c2 ON s.class_id = c2.id
     LEFT JOIN streams str ON e.stream_id = str.id
     LEFT JOIN student_contacts sc ON sc.student_id = s.id AND sc.is_primary = 1
     LEFT JOIN contacts con ON sc.contact_id = con.id
     LEFT JOIN people cp ON con.person_id = cp.id
     WHERE s.id = ?
     LIMIT 1`,
    [studentId],
  );

  if (!rows || !(rows as any[]).length) return null;
  const r = (rows as any[])[0];

  // Fee balance
  const feeRows = await query(
    `SELECT COALESCE(SUM(amount - discount - paid), 0) AS balance
     FROM student_fee_items
     WHERE student_id = ?`,
    [studentId],
  );
  const feeBalance = Number((feeRows as any[])[0]?.balance || 0);

  // Today's attendance count
  const attRows = await query(
    `SELECT COUNT(*) AS cnt
     FROM zk_attendance_logs
     WHERE student_id = ? AND DATE(check_time) = CURDATE()`,
    [studentId],
  );
  const attendanceToday = Number((attRows as any[])[0]?.cnt || 0);

  return {
    student_id: r.student_id,
    admission_no: r.admission_no,
    first_name: r.first_name,
    last_name: r.last_name,
    photo_url: r.photo_url || null,
    class_name: r.class_name || null,
    stream_name: r.stream_name || null,
    student_status: r.student_status || 'admitted',
    enrollment_status: r.enrollment_status || null,
    fee_balance: feeBalance,
    attendance_today: attendanceToday,
    guardian: r.guardian_phone
      ? {
          name: [r.guardian_first_name, r.guardian_last_name].filter(Boolean).join(' '),
          phone: r.guardian_phone,
          relationship: r.relationship || 'Guardian',
        }
      : null,
  };
}
