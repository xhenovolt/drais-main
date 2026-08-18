/**
 * Everything about the students pipeline that is PURE — no DB, no I/O —
 * split out of students.ts so it can be imported WITHOUT pulling in
 * mysql2/getConnection at module scope: the canonical field catalog,
 * StudentRow, validateStudentRow, studentIdentityFromRow, and the small
 * coercion helpers.
 *
 * Why this file exists: students.ts imports `getConnection` from `@/lib/db`
 * at the top level for its `commit()` implementation, which transitively
 * pulls in mysql2 → tls. That's fine for the app (Next.js bundles it), but
 * it breaks `tsx --test` in isolation (confirmed — this is the exact issue
 * src/lib/ingestion/__tests__/students-pipeline.test.mjs already worked
 * around by hand-mirroring pure functions instead of importing the real
 * module, per that file's own header comment). Anything that only needs
 * the pure parts — the sheet-purpose guesser in ../parse/, or a test that
 * wants the REAL validator instead of a mirrored copy — should import from
 * here, not from students.ts.
 *
 * students.ts re-exports everything from here for backward compatibility
 * — no existing import site needs to change.
 */
import type { CanonicalField, IdentityClaim, RawCellValue, RowProvenance } from '../types';

// Synonyms harvested from real-world school exports — the more variants
// we list, the less likely a school sees its first import marked
// 'unresolvedRequired'. Memory still wins for school-specific quirks.
export const STUDENT_FIELDS: CanonicalField[] = [
  {
    name: 'admission_no',
    label: 'Admission Number',
    synonyms: [
      'admission no', 'adm no', 'adm number', 'admno', 'admission number',
      'reg no', 'regno', 'registration no', 'registration number',
      'student id', 'student number', 'student no', 'studentid', 'school id',
      'index no', 'index number', 'roll no', 'roll number', 'stamp no',
      'pin', 'pupil no', 'learner id', 'lin',
    ],
    type: 'string',
    required: true,
  },
  {
    name: 'first_name',
    label: 'First Name',
    synonyms: ['firstname', 'fname', 'given name', 'name1', 'first names'],
    type: 'string',
    required: true,
  },
  {
    name: 'last_name',
    label: 'Last Name',
    synonyms: ['lastname', 'lname', 'surname', 'family name', 'name2', 'last names'],
    type: 'string',
    required: true,
  },
  {
    name: 'other_name',
    label: 'Other Name',
    synonyms: ['middle name', 'middlename', 'middle names', 'other names', 'mname', 'name3'],
    type: 'string',
  },
  {
    name: 'gender',
    label: 'Gender',
    synonyms: ['sex', 'male/female', 'm/f'],
    type: 'enum',
    enumValues: ['male', 'female'],
  },
  {
    name: 'date_of_birth',
    label: 'Date of Birth',
    synonyms: ['dob', 'birth date', 'birthday', 'birthdate', 'date birth'],
    type: 'date',
  },
  {
    name: 'phone',
    label: 'Phone',
    synonyms: ['mobile', 'cell', 'telephone', 'tel', 'phone number', 'contact', 'mobile no'],
    type: 'string',
  },
  {
    name: 'email',
    label: 'Email',
    synonyms: ['email address', 'e-mail', 'email id'],
    type: 'string',
  },
  {
    name: 'address',
    label: 'Address',
    synonyms: ['home address', 'residence', 'street', 'physical address'],
    type: 'string',
  },
  {
    name: 'class_name',
    label: 'Class',
    synonyms: ['class name', 'grade', 'form', 'year', 'level', 'standard'],
    type: 'string',
  },
  {
    name: 'stream_name',
    label: 'Stream',
    synonyms: ['section', 'stream name', 'division', 'arm', 'group'],
    type: 'string',
  },
  {
    name: 'fees_balance',
    label: 'Fees Balance',
    synonyms: ['balance', 'fee balance', 'outstanding', 'amount owed', 'fees owed', 'arrears'],
    type: 'float',
  },
];

// ─── Validated row shape ─────────────────────────────────────────────────────

export interface StudentRow {
  admission_no: string;
  first_name:   string;
  last_name:    string;
  other_name:   string | null;
  gender:       'male' | 'female' | null;
  date_of_birth: string | null;       // YYYY-MM-DD
  phone:        string | null;
  email:        string | null;
  address:      string | null;
  class_name:   string | null;
  stream_name:  string | null;
  fees_balance: number | null;
}

// ─── Per-row validator ───────────────────────────────────────────────────────

export function validateStudentRow(
  mapped: Record<string, RawCellValue>,
  _provenance: RowProvenance,
): { ok: true; value: StudentRow } | { ok: false; error: string } {
  // admission_no is required and must be non-empty after trimming.
  const admission = coerceString(mapped.admission_no);
  if (!admission) return { ok: false, error: 'admission_no is empty' };

  const first = coerceString(mapped.first_name);
  if (!first) return { ok: false, error: 'first_name is empty' };

  const last = coerceString(mapped.last_name);
  if (!last) return { ok: false, error: 'last_name is empty' };

  // Gender enum normalisation.
  let gender: StudentRow['gender'] = null;
  const g = coerceString(mapped.gender)?.toLowerCase();
  if (g === 'm' || g === 'male')   gender = 'male';
  if (g === 'f' || g === 'female') gender = 'female';

  // DOB → YYYY-MM-DD.
  const dob = parseDateToIso(mapped.date_of_birth);

  // Fees → float, comma- and space-stripped.
  const balance = parseMoney(mapped.fees_balance);

  return {
    ok: true,
    value: {
      admission_no:  admission,
      first_name:    first,
      last_name:     last,
      other_name:    coerceString(mapped.other_name),
      gender,
      date_of_birth: dob,
      phone:         coerceString(mapped.phone),
      email:         coerceString(mapped.email),
      address:       coerceString(mapped.address),
      class_name:    coerceString(mapped.class_name),
      stream_name:   coerceString(mapped.stream_name),
      fees_balance:  balance,
    },
  };
}

// ─── Identity extraction ─────────────────────────────────────────────────────

export function studentIdentityFromRow(row: StudentRow): IdentityClaim {
  return {
    admissionNo: row.admission_no,
    firstName:   row.first_name,
    lastName:    row.last_name,
    otherName:   row.other_name ?? undefined,
    className:   row.class_name ?? undefined,
    streamName:  row.stream_name ?? undefined,
    personRole:  'student',
  };
}

// ─── Tiny pure helpers (testable) ────────────────────────────────────────────

export function coerceString(v: RawCellValue): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function parseMoney(v: RawCellValue): number | null {
  if (v == null || v === '') return null;
  // Allow commas + spaces in currency display: "1,200,000.00" → 1200000.00
  const cleaned = String(v).replace(/[\s,]/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function parseDateToIso(v: RawCellValue): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  // ISO already?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const mon = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${mon}-${day}`;
  }
  // Fallback: Date parse.
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
