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
  ConflictDecision,
  IngestionPipeline,
  ResolvedIdentity,
} from '../types';
import { getConnection } from '@/lib/db';
import {
  STUDENT_FIELDS, type StudentRow, validateStudentRow, studentIdentityFromRow,
} from './students-schema';

export { STUDENT_FIELDS, type StudentRow, validateStudentRow, studentIdentityFromRow };

// ─── Validated row shape, canonical fields, validator, identity extraction ──
// All pure — moved to students-schema.ts (re-exported above) so they can be
// imported without pulling in mysql2 via getConnection. See that file's
// header for why.

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
  /**
   * Import redesign Phase B — school-configurable settings (see
   * src/lib/ingestion/settings.ts for the full rationale on defaults).
   * Optional so existing direct callers of makeStudentsPipeline (if any)
   * keep compiling against the DEFAULT (safest) behavior.
   */
  allowUpdateExisting?: boolean;      // default false
  allowClassReassignment?: boolean;   // default false
  autoCreateMissingClasses?: boolean; // default false
}

function withDefaults(ctx: StudentCommitContext): Required<Pick<StudentCommitContext, 'allowUpdateExisting' | 'allowClassReassignment' | 'autoCreateMissingClasses'>> & StudentCommitContext {
  return {
    ...ctx,
    allowUpdateExisting: ctx.allowUpdateExisting ?? false,
    allowClassReassignment: ctx.allowClassReassignment ?? false,
    autoCreateMissingClasses: ctx.autoCreateMissingClasses ?? false,
  };
}

export function makeStudentCommitFn(rawCtx: StudentCommitContext) {
  const ctx = withDefaults(rawCtx);
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
        case 'merge':
          if (identity.personId == null) return;
          if (!ctx.allowUpdateExisting) return; // matched an existing student, but updates are OFF by default — a no-op, not an error
          await updateStudent(conn, identity.personId, row, decision.changedFields, ctx);
          if (ctx.allowClassReassignment) {
            await reassignClassIfNeeded(conn, identity.personId, row, ctx);
          }
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
      const resolved = await resolveClassAndStream(conn, ctx, row.class_name, row.stream_name);
      if (resolved) {
        await conn.execute(
          `INSERT INTO enrollments
             (student_id, class_id, stream_id, status, enrolled_at)
           VALUES (?, ?, ?, 'active', NOW())`,
          [studentId, resolved.classId, resolved.streamId],
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

/**
 * Find an existing class/stream by name, or create the class (never the
 * stream — a stream needs a class to belong to; a row that names a stream
 * under a class that doesn't exist and isn't being auto-created gets no
 * enrolment at all, same as today) when ctx.autoCreateMissingClasses is
 * on. Shared by insertStudent (new student) and reassignClassIfNeeded
 * (existing student, class-change path) so both honour the same setting
 * identically rather than two independently-drifting lookups.
 */
async function resolveClassAndStream(
  conn: Connection,
  ctx: StudentCommitContext,
  className: string,
  streamName: string | null,
): Promise<{ classId: number; streamId: number | null } | null> {
  const [classRows] = await conn.execute(
    `SELECT id FROM classes WHERE school_id = ? AND name = ? LIMIT 1`,
    [ctx.schoolId, className],
  );
  let cls = (classRows as Array<{ id: number }>)[0];

  if (!cls && ctx.autoCreateMissingClasses) {
    const [created] = await conn.execute(
      `INSERT INTO classes (school_id, name) VALUES (?, ?)`,
      [ctx.schoolId, className],
    );
    cls = { id: (created as { insertId: number }).insertId };
  }
  if (!cls) return null;

  let streamId: number | null = null;
  if (streamName) {
    const [streamRows] = await conn.execute(
      `SELECT id FROM streams WHERE class_id = ? AND name = ? LIMIT 1`,
      [cls.id, streamName],
    );
    streamId = (streamRows as Array<{ id: number }>)[0]?.id ?? null;
    if (streamId == null && ctx.autoCreateMissingClasses) {
      const [createdStream] = await conn.execute(
        `INSERT INTO streams (school_id, class_id, name) VALUES (?, ?, ?)`,
        [ctx.schoolId, cls.id, streamName],
      );
      streamId = (createdStream as { insertId: number }).insertId;
    }
  }

  return { classId: cls.id, streamId };
}

/**
 * Import redesign Phase B — class reassignment for an ALREADY-MATCHED
 * existing student, gated entirely by ctx.allowClassReassignment (default
 * false — see settings.ts). Only acts when the row actually names a class
 * different from the student's current active enrolment; a row with no
 * class_name, or the same class_name, is a no-op. Closes the old
 * enrolment (status='closed' — the same fix applied to the manual
 * soft-delete leak in readiness-audit Phase 2, students/bulk/delete)
 * rather than deleting it, so history is preserved.
 */
async function reassignClassIfNeeded(
  conn: Connection,
  studentId: number,
  row: StudentRow,
  ctx: StudentCommitContext,
): Promise<void> {
  if (!row.class_name) return;

  const [currentRows] = await conn.execute(
    `SELECT e.id AS enrollment_id, c.name AS class_name, st.name AS stream_name
       FROM enrollments e
       JOIN classes c ON c.id = e.class_id
       LEFT JOIN streams st ON st.id = e.stream_id
      WHERE e.student_id = ? AND e.status = 'active'
      LIMIT 1`,
    [studentId],
  );
  const current = (currentRows as Array<{ enrollment_id: number; class_name: string; stream_name: string | null }>)[0];

  const sameClass = current?.class_name === row.class_name;
  const sameStream = (current?.stream_name ?? null) === (row.stream_name ?? null);
  if (current && sameClass && sameStream) return; // nothing to do

  const resolved = await resolveClassAndStream(conn, ctx, row.class_name, row.stream_name);
  if (!resolved) return; // class doesn't exist and auto-create is off — leave the existing enrolment untouched

  await conn.beginTransaction();
  try {
    if (current) {
      await conn.execute(`UPDATE enrollments SET status = 'closed' WHERE id = ?`, [current.enrollment_id]);
    }
    await conn.execute(
      `INSERT INTO enrollments (student_id, class_id, stream_id, status, enrolled_at)
       VALUES (?, ?, ?, 'active', NOW())`,
      [studentId, resolved.classId, resolved.streamId],
    );
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  }
}

// ─── Tiny pure helpers ────────────────────────────────────────────────────
// Moved to students-schema.ts along with everything else pure — see this
// file's header comment.

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
