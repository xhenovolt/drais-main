/**
 * Students canonical field catalog — split out of students.ts so it can be
 * imported WITHOUT pulling in mysql2/getConnection at module scope.
 *
 * Why this file exists: students.ts imports `getConnection` from `@/lib/db`
 * at the top level for its `commit()` implementation, which transitively
 * pulls in mysql2 → tls. That's fine for the app (Next.js bundles it), but
 * it breaks `tsx --test` in isolation (confirmed — this is the exact issue
 * src/lib/ingestion/__tests__/students-pipeline.test.mjs already worked
 * around by hand-mirroring pure functions instead of importing the real
 * module, per that file's own header comment). Anything that only needs
 * STUDENT_FIELDS — like the sheet-purpose guesser in ../parse/ — should
 * import it from here, not from students.ts, so it stays trivially
 * testable without DB-touching side effects.
 *
 * students.ts re-exports STUDENT_FIELDS from here for backward
 * compatibility — no existing import site needs to change.
 */
import type { CanonicalField } from '../types';

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
