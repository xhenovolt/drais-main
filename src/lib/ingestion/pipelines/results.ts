/**
 * Results pipeline — IngestionPipeline<ResultRow> for marks/results.
 *
 * Parallel to the legacy /api/class_results/import. Schools opt into
 * the new path via POST /api/class_results/import/v2; ImportModal /
 * ResultsImportSystem UI continues to call the legacy path until
 * schools validate the v2 behaviour.
 *
 * Shape note — results files are WIDE (one row per student, N
 * columns per subject). The v2 route EXPLODES each source row into N
 * canonical rows ({ admission_no, subject_name, score }) BEFORE
 * handing them to the pipeline. This file deals only with the
 * post-explosion canonical shape; the explosion logic lives in the
 * route's parser.
 *
 * Phase 0 problems v2 fixes (vs the legacy path):
 *
 *   Legacy                                  v2
 *   ──────────────────────────────────────  ────────────────────────────────────────
 *   silent skip on duplicate (per-cell)     ConflictDecision recorded; school-
 *                                            configurable policy (prefer-existing /
 *                                            prefer-new / merge-average / fail-loud)
 *   silent skip when subject not            orphaned with reason; resolvable from
 *     allocated to class                     admin UI (the school's call:
 *                                            allocate + re-run OR dismiss)
 *   silent skip when student not found      orphaned with reason (no admission_no
 *                                            match in this school)
 *   no learning between imports             ingestion_field_memory caches
 *                                            "Maths" → "Mathematics" mappings etc.
 *   no per-row audit                        full IngestionReport persisted to
 *                                            ingestion_runs
 */

import type { Connection } from 'mysql2/promise';
import type {
  CanonicalField,
  ConflictDecision,
  IdentityClaim,
  IngestionPipeline,
  ResolvedIdentity,
  RawCellValue,
  RowProvenance,
} from '../types';
import { getConnection } from '@/lib/db';

// ─── Validated row shape (post-explosion) ────────────────────────────────────

export interface ResultRow {
  /** Whose result this is — the only identity signal we need. */
  admission_no: string;
  /** Subject name from the source header (e.g. "Mathematics", "English",
   *  or even "Maths" — the schema inference will normalise). */
  subject_name: string;
  /** Raw numeric score. Null = no score recorded; the pipeline skips
   *  the cell rather than writing a null INSERT. */
  score:        number | null;
  /** Optional per-cell extras. */
  grade?:       string | null;
  remarks?:     string | null;
  teacher_initials?: string | null;
}

// ─── Canonical field catalog (post-explosion) ────────────────────────────────
// The exploder produces RawRows with these column names; the inference
// engine maps each one to the same canonical field below. No fuzz
// happens at this layer — the route's exploder already normalised the
// shape. But we still go through inferSchema so synonyms ("ADM No" →
// admission_no) work for schools whose explosion uses different
// header names.

export const RESULT_FIELDS: CanonicalField[] = [
  {
    name: 'admission_no',
    label: 'Admission Number',
    synonyms: [
      'admission no', 'adm no', 'adm number', 'admno', 'admission number',
      'reg no', 'regno', 'registration no', 'registration number',
      'student id', 'student number', 'student no', 'studentid',
      'index no', 'index number', 'pin', 'pupil no', 'learner id',
    ],
    type: 'string',
    required: true,
  },
  {
    name: 'subject_name',
    label: 'Subject',
    synonyms: ['subject', 'subject name', 'paper', 'discipline', 'subject_code', 'subjectcode'],
    type: 'string',
    required: true,
  },
  {
    name: 'score',
    label: 'Score',
    synonyms: ['mark', 'marks', 'value', 'result', 'grade', 'total', 'points'],
    type: 'float',
    required: true,
  },
  {
    name: 'grade',
    label: 'Grade',
    synonyms: ['letter', 'letter grade', 'band'],
    type: 'string',
  },
  {
    name: 'remarks',
    label: 'Remarks',
    synonyms: ['comment', 'comments', 'notes', 'feedback', 'teacher comment'],
    type: 'string',
  },
  {
    name: 'teacher_initials',
    label: 'Teacher Initials',
    synonyms: ['teacher', 'initials', 'tr initials', 'tr', 'sig'],
    type: 'string',
  },
];

// ─── Per-row validator ───────────────────────────────────────────────────────

export function validateResultRow(
  mapped: Record<string, RawCellValue>,
  _provenance: RowProvenance,
): { ok: true; value: ResultRow } | { ok: false; error: string } {
  const adm = coerceString(mapped.admission_no);
  if (!adm) return { ok: false, error: 'admission_no is empty' };
  const subject = coerceString(mapped.subject_name);
  if (!subject) return { ok: false, error: 'subject_name is empty' };

  const score = parseScore(mapped.score);
  // score=null is legal — represents "empty cell" which the commit
  // path will skip (no value to write). validateRow returns ok=true
  // and lets the commit decide.

  return {
    ok: true,
    value: {
      admission_no:     adm,
      subject_name:     subject,
      score,
      grade:            coerceString(mapped.grade),
      remarks:          coerceString(mapped.remarks),
      teacher_initials: coerceString(mapped.teacher_initials),
    },
  };
}

// ─── Identity extractor — admission_no only ─────────────────────────────────

export function resultIdentityFromRow(row: ResultRow): IdentityClaim {
  return {
    admissionNo: row.admission_no,
    personRole:  'student',
  };
}

// ─── Commit context — supplies the (year, term, class, type) frame ─────────
//
// Every row in a single import run shares the same frame; the route
// reads it once from form data and passes it here. Subject names are
// resolved to subject_ids at commit time via a small per-run cache
// (built once per run, not per row).

export interface ResultsCommitContext {
  schoolId:        number;
  academicYearId:  number;
  termId:          number | null;
  classId:         number;
  resultTypeId:    number;
  /** Whether to honour subject_allocations — when true (default), rows
   *  for subjects not allocated to classId are orphaned. When false,
   *  the commit writes anyway (legacy parity for schools who haven't
   *  set up allocations). */
  enforceAllocation?: boolean;
  /** Per-run subject cache — populated lazily on first lookup. */
  subjectCache?:   Map<string, number | null>;
  /** Per-run allocation cache — keyed on `subjectId`. */
  allocationCache?: Map<number, boolean>;
  importedBy:      number | null;
}

export function makeResultsCommitFn(ctx: ResultsCommitContext) {
  const subjectCache = ctx.subjectCache ?? new Map<string, number | null>();
  const allocationCache = ctx.allocationCache ?? new Map<number, boolean>();
  const enforceAllocation = ctx.enforceAllocation ?? true;

  return async function commit(
    row: ResultRow,
    identity: ResolvedIdentity,
    decision: ConflictDecision,
  ): Promise<void> {
    // Skip non-actionable decisions early — pipeline already counted
    // them.
    if (decision.action === 'skip' || decision.action === 'fail'
        || decision.action === 'orphan' || decision.action === 'insert' && row.score == null) {
      return;
    }
    if (identity.personId == null) return;
    if (row.score == null) {
      // No score in this cell → nothing to write. We don't INSERT null
      // results; that pollutes downstream rankings.
      return;
    }

    const conn = await getConnection();
    try {
      const subjectId = await resolveSubjectId(conn, ctx.schoolId, row.subject_name, subjectCache);
      if (subjectId == null) {
        // Should not happen if route pre-validated, but be defensive.
        return;
      }

      if (enforceAllocation) {
        const allocated = await isSubjectAllocated(conn, ctx.classId, subjectId, allocationCache);
        if (!allocated) {
          // Pipeline's orphan path runs separately — here we just no-op.
          return;
        }
      }

      switch (decision.action) {
        case 'insert':
          await conn.execute(
            `INSERT INTO class_results
               (class_id, subject_id, result_type_id, term_id, academic_year_id, student_id, score, grade, remarks)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              ctx.classId, subjectId, ctx.resultTypeId, ctx.termId, ctx.academicYearId,
              identity.personId, row.score, row.grade ?? null, row.remarks ?? null,
            ] as never,
          );
          return;
        case 'update':
        case 'merge': {
          // Update only the columns the conflict resolver said changed,
          // restricted to the result row uniqueness key.
          const updatable = new Set(['score', 'grade', 'remarks']);
          const fields = decision.changedFields.filter(f => updatable.has(f));
          if (fields.length === 0) return;
          const setClause = fields.map(f => `${f} = ?`).join(', ');
          const values = fields.map(f => (row as unknown as Record<string, unknown>)[f]);
          await conn.execute(
            `UPDATE class_results
                SET ${setClause}
              WHERE class_id = ? AND subject_id = ? AND result_type_id = ?
                AND (term_id <=> ?) AND student_id = ?`,
            [...values, ctx.classId, subjectId, ctx.resultTypeId, ctx.termId, identity.personId] as never,
          );
          return;
        }
      }
    } finally {
      try { await conn.end(); } catch { /* ignore */ }
    }
  };
}

// ─── Subject + allocation resolution (cached per run) ───────────────────────

export async function resolveSubjectId(
  conn: Connection,
  schoolId: number,
  rawSubjectName: string,
  cache: Map<string, number | null>,
): Promise<number | null> {
  const key = rawSubjectName.trim().toLowerCase();
  if (cache.has(key)) return cache.get(key) ?? null;

  // Try exact match first; fall back to LIKE to catch "Maths" → "Mathematics".
  const [exact] = await conn.execute(
    `SELECT id FROM subjects
      WHERE school_id = ? AND LOWER(name) = ? LIMIT 1`,
    [schoolId, key],
  );
  let id: number | null = (exact as Array<{ id: number }>)[0]?.id ?? null;

  if (id == null) {
    const [like] = await conn.execute(
      `SELECT id FROM subjects
        WHERE school_id = ?
          AND (LOWER(name) LIKE ? OR LOWER(short_name) LIKE ?)
        LIMIT 1`,
      [schoolId, `${key}%`, `${key}%`],
    );
    id = (like as Array<{ id: number }>)[0]?.id ?? null;
  }

  cache.set(key, id);
  return id;
}

export async function isSubjectAllocated(
  conn: Connection,
  classId: number,
  subjectId: number,
  cache: Map<number, boolean>,
): Promise<boolean> {
  if (cache.has(subjectId)) return cache.get(subjectId)!;
  const [rows] = await conn.execute(
    `SELECT 1 FROM class_subjects WHERE class_id = ? AND subject_id = ? LIMIT 1`,
    [classId, subjectId],
  );
  const ok = ((rows as unknown[]).length > 0);
  cache.set(subjectId, ok);
  return ok;
}

// ─── Tiny pure helpers (testable) ───────────────────────────────────────────

export function coerceString(v: RawCellValue): string | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

export function parseScore(v: RawCellValue): number | null {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  // Match the FIRST numeric token. Catches: '85', '85.5', '-3',
  // '85%' → 85, '85 marks' → 85, '78 / 100' → 78.
  // Earlier regex `.replace(/[^\d.\-]/g, '')` was wrong: '78 / 100'
  // collapsed to '78100'. This implementation strips leading
  // non-numeric characters then matches the first complete number.
  const head = s.replace(/^[^\d.\-]+/, '');
  const m = /^-?\d+(?:\.\d+)?/.exec(head);
  if (!m) return null;
  const n = Number.parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function makeResultsPipeline(
  ctx: ResultsCommitContext,
): IngestionPipeline<ResultRow> {
  return {
    name: 'results',
    schema: RESULT_FIELDS,
    validateRow: validateResultRow,
    identityFromRow: resultIdentityFromRow,
    commit: makeResultsCommitFn(ctx),
  };
}

// ─── Exploder — wide-row CSV/XLSX → canonical row stream ───────────────────
//
// Each source row {admission_no, Math: 75, English: 82, Science: ''}
// becomes N canonical rows. Empty cells are skipped at the source so
// the pipeline never validates a "score=null" row.

export interface ExplodeArgs {
  /** Already-parsed wide rows (one per student). */
  wideRows: Array<Record<string, unknown> & { __provenance: RowProvenance }>;
  /** Which source headers represent subject columns. Detected by the
   *  route after schema inference: headers NOT in {admission_no,
   *  first_name, last_name, …identity columns} are subject columns. */
  subjectHeaders: string[];
  /** Identity columns to copy into each exploded row. Always includes
   *  admission_no. */
  identityHeaders: string[];
}

export interface ExplodedRow {
  __provenance: RowProvenance;
  admission_no: unknown;
  subject_name: string;
  score:        unknown;
  /** Original source row index — lets the orphan queue point reviewers
   *  back at the exact cell. */
  __sourceCell: { row: number; column: string };
}

export function explodeWideResultsRows(args: ExplodeArgs): ExplodedRow[] {
  const out: ExplodedRow[] = [];
  for (const wide of args.wideRows) {
    for (const subj of args.subjectHeaders) {
      const cellValue = wide[subj];
      // Skip empty cells — no score, no INSERT.
      if (cellValue == null || cellValue === '') continue;
      out.push({
        __provenance: {
          ...wide.__provenance,
          // Keep source row index; add the column so error reporting
          // can pin the cell exactly.
          sourceRowIndex: wide.__provenance.sourceRowIndex,
        },
        admission_no: wide.admission_no ?? wide['admission_no'],
        subject_name: subj,
        score:        cellValue,
        __sourceCell: { row: wide.__provenance.sourceRowIndex, column: subj },
      });
    }
  }
  return out;
}
