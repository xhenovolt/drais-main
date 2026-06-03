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
  /** Boarding | Day | null. Resolved from school-defined custom fields
   *  whose codes typically include `is_boarding`, `boarding`,
   *  `accommodation`, `accommodation_type`, `residence_type`,
   *  `boarding_status`, `day_or_boarding`, `boarder`. */
  accommodation: 'Boarding' | 'Day' | null;
  /** Free-text section label (e.g. "House A", "Block 3") sourced from
   *  custom fields with codes like `section`, `house`, `block`,
   *  `dormitory`. */
  section: string | null;
  guardian: {
    name: string;
    phone: string;
    relationship: string;
  } | null;
}

/** Codes (case-insensitive) that we treat as boarding-vs-day indicators. */
const ACCOMMODATION_CODES = [
  'is_boarding', 'boarding', 'boarder',
  'accommodation', 'accommodation_type',
  'residence_type', 'boarding_status', 'day_or_boarding',
];

/** Codes that we treat as a "section / house / block" label. */
const SECTION_CODES = ['section', 'house', 'block', 'dormitory', 'dorm'];

function coerceAccommodation(raw: unknown): 'Boarding' | 'Day' | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'boolean') return raw ? 'Boarding' : 'Day';
  if (typeof raw === 'number') return raw === 1 ? 'Boarding' : raw === 0 ? 'Day' : null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  if (['1', 'true', 'yes', 'y', 'boarding', 'boarder', 'resident', 'residential'].includes(s)) return 'Boarding';
  if (['0', 'false', 'no', 'n', 'day', 'day_scholar', 'day-scholar', 'non-boarding', 'non_boarding'].includes(s)) return 'Day';
  // Schools sometimes put their own label — surface it as boarding when it
  // looks boarding-y; otherwise default to Day to avoid false positives.
  if (s.includes('board')) return 'Boarding';
  if (s.includes('day')) return 'Day';
  return null;
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

  // Boarding / Day + section from custom_fields.
  // We probe by code (case-insensitive) so schools that named the
  // field `is_boarding`, `accommodation`, `residence_type`, etc. all
  // resolve. The query is best-effort — if the table is absent we
  // simply return null for these fields rather than failing the popup.
  let accommodation: 'Boarding' | 'Day' | null = null;
  let section: string | null = null;
  try {
    const allCodes = [...ACCOMMODATION_CODES, ...SECTION_CODES];
    const placeholders = allCodes.map(() => '?').join(',');
    const cfRows = (await query(
      `SELECT LOWER(f.code) AS code, f.data_type,
              v.value_text, v.value_number, v.value_bool, v.value_json
         FROM student_custom_values v
         JOIN custom_fields f ON f.id = v.field_id
        WHERE v.student_id = ?
          AND f.is_active = 1
          AND LOWER(f.code) IN (${placeholders})`,
      [studentId, ...allCodes],
    )) as Array<{
      code: string; data_type: string;
      value_text: string | null; value_number: number | null;
      value_bool: number | null; value_json: string | null;
    }>;

    for (const cf of cfRows) {
      const raw =
        cf.value_bool !== null ? Boolean(cf.value_bool) :
        cf.value_text          ? cf.value_text :
        cf.value_number !== null ? cf.value_number :
        cf.value_json          ? cf.value_json :
        null;
      if (ACCOMMODATION_CODES.includes(cf.code)) {
        const decoded = coerceAccommodation(raw);
        if (decoded && !accommodation) accommodation = decoded;
      } else if (SECTION_CODES.includes(cf.code)) {
        const txt = raw == null ? '' : String(raw).trim();
        if (txt && !section) section = txt;
      }
    }
  } catch { /* custom fields table missing — fall through with nulls */ }

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
    accommodation,
    section,
    guardian: r.guardian_phone
      ? {
          name: [r.guardian_first_name, r.guardian_last_name].filter(Boolean).join(' '),
          phone: r.guardian_phone,
          relationship: r.relationship || 'Guardian',
        }
      : null,
  };
}
