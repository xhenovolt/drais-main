/**
 * Students pipeline — the IngestionPipeline implementation for the
 * /api/students/import/v2 route.
 *
 * Defines:
 *   - Canonical fields (the headers the inference engine maps onto)
 *   - StudentRow (validated shape per row)
 *   - validateRow (type coercion + lightweight checks)
 *   - identityFromRow (admission_no + first+last name + class)
 *   - commit (the actual DB writes — INSERT person+student+enrolment
 *     on no-match; UPDATE on confident match; orphan otherwise)
 *
 * Parallel to the legacy route src/app/api/students/import/route.ts.
 * Schools opt in by hitting POST /api/students/import/v2 instead of
 * /api/students/import. ImportModal UI doesn't switch yet — that's
 * deferred until schools validate the v2 path against real exports.
 *
 * What changes vs the legacy path:
 *
 *   ┌────────────────────────────┬──────────────────────────────┬──────────────────────────────┐
 *   │ Concern                    │ Legacy /api/students/import  │ v2 (this pipeline)            │
 *   ├────────────────────────────┼──────────────────────────────┼──────────────────────────────┤
 *   │ CSV parser                 │ custom regex (RFC 4180)       │ same parser (xlsx package)    │
 *   │ Header → field mapping     │ hand-rolled exact + fuzzy     │ schema-inference engine       │
 *   │                            │ in importHelpers.ts           │ (memory → exact → synonym →   │
 *   │                            │                               │  fuzzy + ambiguity guard)     │
 *   │ Identity resolution        │ admission_no → name+class →   │ central resolveIdentity      │
 *   │                            │   NO_MATCH branch             │ (4 signals + cross-checks)    │
 *   │ Conflict policy            │ updateExisting boolean flag   │ school-configurable           │
 *   │                            │ (overwrite/skip whole row)    │ FieldConflictPolicy per field │
 *   │ Skipped rows               │ silent SSE 'skipped' counter  │ ConflictDecision in audit log │
 *   │                            │                               │ — every action recorded       │
 *   │ Memory                     │ none — every import re-detects│ ingestion_field_memory caches │
 *   │                            │ headers from scratch          │ school's prior approvals      │
 *   │ Orphan queue               │ none — failed rows just listed│ ingestion_orphans table —     │
 *   │                            │ in the response               │ resolvable from admin UI later│
 *   └────────────────────────────┴──────────────────────────────┴──────────────────────────────┘
 */

import type { Connection } from 'mysql2/promise';
import type {
  CanonicalField,
  ConflictDecision,
  IdentityClaim,
  IngestionPipeline,
  ResolvedIdentity,
  RowProvenance,
  RawCellValue,
} from '../types';
import { getConnection } from '@/lib/db';

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

// ─── Canonical field catalog ─────────────────────────────────────────────────
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

// ─── Commit (the real DB writes) ─────────────────────────────────────────────
// Honest about every action it takes — decision.action drives the SQL.
//
//   'insert'  → CREATE people + students + active enrolment row
//   'update'  → UPDATE the changed columns ONLY (per ConflictDecision.changedFields)
//   'merge'   → UPDATE with the merged value (e.g. average of fees balances)
//   'skip'    → no-op (already logged by the pipeline)
//   'orphan'  → caller persists to ingestion_orphans (the route does this)
//   'fail'    → no-op here (already in the report's failed counter)

export interface StudentCommitContext {
  schoolId: number;
  /** Optional: user id of the person running the import (for audit). */
  importedBy: number | null;
  /** Whether to auto-create an active enrolment when class_name resolves
   *  to an existing class. Default true. */
  autoEnroll: boolean;
}

export function makeStudentCommitFn(ctx: StudentCommitContext) {
  return async function commit(
    row: StudentRow,
    identity: ResolvedIdentity,
    decision: ConflictDecision,
  ): Promise<void> {
    const conn = await getConnection();
    try {
      switch (decision.action) {
        case 'insert':
          await insertStudent(conn, row, ctx);
          return;
        case 'update':
          if (identity.personId == null) return;
          await updateStudent(conn, identity.personId, row, decision.changedFields, ctx);
          return;
        case 'merge':
          if (identity.personId == null) return;
          await updateStudent(conn, identity.personId, row, decision.changedFields, ctx);
          return;
        case 'skip':
        case 'orphan':
        case 'fail':
          // Pipeline already accounted for these in the report.
          return;
      }
    } finally {
      try { await conn.end(); } catch { /* ignore */ }
    }
  };
}

// ─── SQL helpers (small + audited) ───────────────────────────────────────────

async function insertStudent(
  conn: Connection,
  row: StudentRow,
  ctx: StudentCommitContext,
): Promise<void> {
  await conn.beginTransaction();
  try {
    // 1. Insert into people.
    const [pRes] = await conn.execute(
      `INSERT INTO people
         (first_name, last_name, other_name, gender, date_of_birth, phone, email, address)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.first_name, row.last_name, row.other_name, row.gender,
        row.date_of_birth, row.phone, row.email, row.address,
      ],
    );
    const personId = (pRes as { insertId: number }).insertId;

    // 2. Insert into students.
    const [sRes] = await conn.execute(
      `INSERT INTO students
         (school_id, person_id, admission_no, first_name, last_name,
          other_name, gender, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      [
        ctx.schoolId, personId, row.admission_no,
        row.first_name, row.last_name, row.other_name, row.gender,
        ctx.importedBy,
      ],
    );
    const studentId = (sRes as { insertId: number }).insertId;

    // 3. Optionally enrol them.
    if (ctx.autoEnroll && row.class_name) {
      const [classRows] = await conn.execute(
        `SELECT id FROM classes WHERE school_id = ? AND name = ? LIMIT 1`,
        [ctx.schoolId, row.class_name],
      );
      const cls = (classRows as Array<{ id: number }>)[0];
      if (cls) {
        let streamId: number | null = null;
        if (row.stream_name) {
          const [streamRows] = await conn.execute(
            `SELECT id FROM streams WHERE class_id = ? AND name = ? LIMIT 1`,
            [cls.id, row.stream_name],
          );
          streamId = (streamRows as Array<{ id: number }>)[0]?.id ?? null;
        }
        await conn.execute(
          `INSERT INTO enrollments
             (student_id, class_id, stream_id, status, enrolled_at)
           VALUES (?, ?, ?, 'active', NOW())`,
          [studentId, cls.id, streamId],
        );
      }
    }

    // 4. Fees balance (optional).
    if (row.fees_balance != null) {
      await conn.execute(
        `INSERT INTO student_fee_items (student_id, balance, school_id)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE balance = VALUES(balance)`,
        [studentId, row.fees_balance, ctx.schoolId],
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}

async function updateStudent(
  conn: Connection,
  studentId: number,
  row: StudentRow,
  changedFields: string[],
  ctx: StudentCommitContext,
): Promise<void> {
  // We honour `changedFields` — only update the columns the conflict
  // resolver said changed. Phase 0 found bulk-submit silently
  // overwriting every column; this path is the opposite.
  if (changedFields.length === 0) return;

  // Map canonical → DB column (here they're identical; future fields
  // may need translation).
  const updatable = new Set([
    'first_name', 'last_name', 'other_name', 'gender', 'date_of_birth',
    'phone', 'email', 'address', 'fees_balance',
  ]);

  const updates: string[] = [];
  const values: unknown[] = [];
  for (const f of changedFields) {
    if (!updatable.has(f)) continue;
    if (f === 'fees_balance') continue; // handled separately
    updates.push(`${f} = ?`);
    values.push((row as unknown as Record<string, unknown>)[f]);
  }

  // 1. people-table updates.
  if (updates.length > 0) {
    values.push(studentId);
    await conn.execute(
      `UPDATE people p
          JOIN students s ON s.person_id = p.id
          SET ${updates.join(', ')}
        WHERE s.id = ? AND s.school_id = ?`,
      [...values, ctx.schoolId] as never,
    );
  }

  // 2. fees_balance (separate table).
  if (changedFields.includes('fees_balance') && row.fees_balance != null) {
    await conn.execute(
      `INSERT INTO student_fee_items (student_id, balance, school_id)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE balance = VALUES(balance)`,
      [studentId, row.fees_balance, ctx.schoolId],
    );
  }
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

// ─── Factory — the IngestionPipeline the v2 route consumes ─────────────────

export function makeStudentsPipeline(
  ctx: StudentCommitContext,
): IngestionPipeline<StudentRow> {
  return {
    name: 'students',
    schema: STUDENT_FIELDS,
    validateRow: validateStudentRow,
    identityFromRow: studentIdentityFromRow,
    commit: makeStudentCommitFn(ctx),
  };
}
