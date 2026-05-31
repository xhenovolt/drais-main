/**
 * POST /api/students/repair-names
 *
 * Operator-facing repair surface for the late-2025 name-corruption pattern
 * (first_name == last_name, dropped other_name). See PHASE 1A audit.
 *
 * Modes:
 *   mode=preview   — upload a corrections CSV/XLSX. Match by admission_no,
 *                    compute the per-row diff. Persist as a `previewed`
 *                    session. Returns the diff for the UI to render.
 *
 *   mode=apply     — apply a previewed session in a single transaction.
 *                    Writes the new values to `people` and stamps
 *                    `applied_at` on the session + every change row.
 *
 *   mode=rollback  — invert every change row in an applied session.
 *                    Restores the old_value into the column even when
 *                    later edits touched other fields on the person.
 *
 * Required spreadsheet columns (case-insensitive):
 *   Admission Number  (required — unique identity key)
 *   First Name        (optional — only changed when present)
 *   Last Name         (optional)
 *   Other Name        (optional — pass an empty cell to leave existing
 *                       value untouched; pass the literal "(clear)" to
 *                       set it to NULL)
 *
 * Loud-fail semantics:
 *   - Unmatched admission numbers are surfaced separately, never silent.
 *   - Rows where every name field equals the existing value contribute
 *     zero changes (no-op rows). Counted but not applied.
 *   - Diffs persisted at preview time are the source of truth for apply.
 *     We do NOT re-read the file at apply time — a re-upload is a new
 *     session, which preserves auditability.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';

// ─── Shape helpers ──────────────────────────────────────────────────────────

type FieldName = 'first_name' | 'last_name' | 'other_name';

interface RepairRowInput {
  admission_no: string;
  first_name?: string | null;
  last_name?: string | null;
  other_name?: string | null;
  sourceRow: number;
}

interface ProposedChange {
  person_id: number;
  student_id: number;
  admission_no: string;
  field: FieldName;
  old_value: string | null;
  new_value: string | null;
}

interface MatchedRow {
  sourceRow: number;
  admission_no: string;
  current: { first_name: string | null; last_name: string | null; other_name: string | null };
  incoming: { first_name?: string | null; last_name?: string | null; other_name?: string | null };
  changes: ProposedChange[];
  person_id: number;
  student_id: number;
}

interface UnmatchedRow {
  sourceRow: number;
  admission_no: string;
  reason: string;
}

// ─── File parsing ───────────────────────────────────────────────────────────

function trimOrNull(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

/** "(clear)" is the explicit sentinel for "set this field to NULL". An
 *  empty cell means "do not change". */
function intentForField(raw: unknown): { kind: 'noop' } | { kind: 'clear' } | { kind: 'set'; value: string } {
  const s = (raw == null ? '' : String(raw)).trim();
  if (s === '') return { kind: 'noop' };
  if (s.toLowerCase() === '(clear)') return { kind: 'clear' };
  return { kind: 'set', value: s };
}

async function parseFile(file: File): Promise<{ headers: string[]; rows: unknown[][] }> {
  const bytes = await file.arrayBuffer();
  if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
    const wb = XLSX.read(bytes, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
    const headers = (matrix[0] || []).map(h => String(h ?? '').trim());
    return { headers, rows: matrix.slice(1).filter(r => r.some(c => c !== '' && c != null)) };
  }
  if (file.name.toLowerCase().endsWith('.csv')) {
    const text = new TextDecoder().decode(bytes);
    const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true });
    const rows = parsed.data as unknown[][];
    const headers = (rows[0] || []).map(h => String(h ?? '').trim());
    return { headers, rows: rows.slice(1) };
  }
  throw new Error('Unsupported file format. Use .csv or .xlsx');
}

function indexOfHeader(headers: string[], ...candidates: string[]): number {
  const norm = headers.map(h => h.toLowerCase().replace(/[\s_\-]+/g, ''));
  for (const c of candidates) {
    const target = c.toLowerCase().replace(/[\s_\-]+/g, '');
    const i = norm.indexOf(target);
    if (i !== -1) return i;
  }
  return -1;
}

function extractRepairRows(headers: string[], rows: unknown[][]): { rows: RepairRowInput[]; admIdx: number; firstIdx: number; lastIdx: number; otherIdx: number } {
  const admIdx   = indexOfHeader(headers, 'admission_no', 'admno', 'admission_number', 'reg_no', 'registration');
  const firstIdx = indexOfHeader(headers, 'first_name', 'firstname', 'given_name', 'fname');
  const lastIdx  = indexOfHeader(headers, 'last_name', 'lastname', 'surname', 'family_name', 'lname');
  const otherIdx = indexOfHeader(headers, 'other_name', 'othername', 'middle_name', 'middlename', 'mname');

  const out: RepairRowInput[] = [];
  rows.forEach((r, i) => {
    const adm = admIdx !== -1 ? trimOrNull(r[admIdx]) : null;
    if (!adm) return;
    out.push({
      admission_no: adm,
      first_name:   firstIdx !== -1 ? (r[firstIdx] as string | null | undefined) ?? null : null,
      last_name:    lastIdx  !== -1 ? (r[lastIdx]  as string | null | undefined) ?? null : null,
      other_name:   otherIdx !== -1 ? (r[otherIdx] as string | null | undefined) ?? null : null,
      sourceRow:    i + 2, // +1 for 0-index, +1 for header row
    });
  });
  return { rows: out, admIdx, firstIdx, lastIdx, otherIdx };
}

// ─── Diffing ────────────────────────────────────────────────────────────────

function diffRow(
  row: RepairRowInput,
  current: { first_name: string | null; last_name: string | null; other_name: string | null },
  context: { person_id: number; student_id: number; admission_no: string },
): ProposedChange[] {
  const out: ProposedChange[] = [];
  const fields: FieldName[] = ['first_name', 'last_name', 'other_name'];
  for (const field of fields) {
    const intent = intentForField(row[field]);
    if (intent.kind === 'noop') continue;
    const next: string | null = intent.kind === 'clear' ? null : intent.value;
    const prev = current[field];
    // Skip when there is nothing to change.
    if ((prev ?? null) === (next ?? null)) continue;
    out.push({
      person_id:    context.person_id,
      student_id:   context.student_id,
      admission_no: context.admission_no,
      field,
      old_value:    prev,
      new_value:    next,
    });
  }
  return out;
}

// ─── Route ──────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;
  const actorUserId = (session as { userId?: number | null }).userId ?? null;

  const formData = await req.formData();
  const mode = String(formData.get('mode') || 'preview');

  // ── PREVIEW ─────────────────────────────────────────────────────────────
  if (mode === 'preview') {
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });

    let parsed;
    try {
      parsed = await parseFile(file);
    } catch (e) {
      return NextResponse.json({ success: false, error: (e as Error).message }, { status: 400 });
    }
    const { headers, rows } = parsed;
    const { rows: repairRows, admIdx } = extractRepairRows(headers, rows);
    if (admIdx === -1) {
      return NextResponse.json({
        success: false,
        error: `No Admission Number column found. Headers: ${headers.join(', ')}`,
      }, { status: 400 });
    }

    const conn = await getConnection();
    try {
      // Pull every referenced learner in one query.
      const admNos = repairRows.map(r => r.admission_no);
      let existingByAdm = new Map<string, { person_id: number; student_id: number; first_name: string | null; last_name: string | null; other_name: string | null; admission_no: string }>();
      if (admNos.length > 0) {
        // Use IN (...) with explicit placeholders to stay safely parameterised.
        const placeholders = admNos.map(() => '?').join(',');
        const [rowsDb] = await conn.execute<any[]>(
          `SELECT s.id AS student_id, p.id AS person_id, s.admission_no,
                  p.first_name, p.last_name, p.other_name
             FROM students s JOIN people p ON p.id = s.person_id
            WHERE s.school_id = ?
              AND s.admission_no IN (${placeholders})
              AND s.deleted_at IS NULL`,
          [schoolId, ...admNos],
        );
        for (const r of rowsDb) existingByAdm.set(String(r.admission_no).toLowerCase().trim(), r);
      }

      const matched: MatchedRow[] = [];
      const unmatched: UnmatchedRow[] = [];
      const allChanges: ProposedChange[] = [];

      for (const row of repairRows) {
        const found = existingByAdm.get(row.admission_no.toLowerCase().trim());
        if (!found) {
          unmatched.push({ sourceRow: row.sourceRow, admission_no: row.admission_no, reason: 'admission number not found in this school' });
          continue;
        }
        const current = { first_name: found.first_name, last_name: found.last_name, other_name: found.other_name };
        const changes = diffRow(row, current, { person_id: found.person_id, student_id: found.student_id, admission_no: found.admission_no });
        matched.push({
          sourceRow:    row.sourceRow,
          admission_no: found.admission_no,
          current,
          incoming: { first_name: row.first_name, last_name: row.last_name, other_name: row.other_name },
          changes,
          person_id:    found.person_id,
          student_id:   found.student_id,
        });
        for (const c of changes) allChanges.push(c);
      }

      // Persist a previewed session even if there are zero changes — the
      // operator might want to upload a deliberate audit "noop file" to
      // prove the data is already clean.
      const [sessRes] = await conn.execute(
        `INSERT INTO name_repair_sessions (school_id, actor_user_id, filename, total_rows, matched_rows, status)
         VALUES (?, ?, ?, ?, ?, 'previewed')`,
        [schoolId, actorUserId, file.name || null, repairRows.length, matched.length],
      );
      const sessionDbId = (sessRes as { insertId: number }).insertId;

      if (allChanges.length > 0) {
        const values = allChanges.flatMap(c => [
          sessionDbId, schoolId, c.person_id, c.student_id, c.admission_no, c.field, c.old_value, c.new_value,
        ]);
        const placeholders = allChanges.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
        await conn.query(
          `INSERT INTO name_repair_changes
             (session_id, school_id, person_id, student_id, admission_no, field_name, old_value, new_value)
           VALUES ${placeholders}`,
          values,
        );
      }

      return NextResponse.json({
        success:        true,
        session_id:     sessionDbId,
        total_rows:     repairRows.length,
        matched_count:  matched.length,
        unmatched_count: unmatched.length,
        changes_count:  allChanges.length,
        matched,
        unmatched,
      });
    } finally {
      await conn.end();
    }
  }

  // ── APPLY ───────────────────────────────────────────────────────────────
  if (mode === 'apply') {
    const sessionId = Number(formData.get('session_id'));
    if (!sessionId) return NextResponse.json({ success: false, error: 'session_id required' }, { status: 400 });

    const conn = await getConnection();
    try {
      const [sessRows] = await conn.execute<any[]>(
        `SELECT id, status FROM name_repair_sessions WHERE id = ? AND school_id = ?`,
        [sessionId, schoolId],
      );
      if (sessRows.length === 0) return NextResponse.json({ success: false, error: 'session not found' }, { status: 404 });
      if (sessRows[0].status !== 'previewed') {
        return NextResponse.json({ success: false, error: `cannot apply a session in '${sessRows[0].status}' state` }, { status: 409 });
      }

      const [changes] = await conn.execute<any[]>(
        `SELECT id, person_id, field_name, new_value
           FROM name_repair_changes
          WHERE session_id = ? AND school_id = ? AND applied_at IS NULL`,
        [sessionId, schoolId],
      );

      await conn.beginTransaction();
      try {
        for (const c of changes) {
          // Whitelist field name — never interpolate user input into a
          // column position.
          const col = c.field_name === 'first_name' ? 'first_name'
                    : c.field_name === 'last_name'  ? 'last_name'
                    : c.field_name === 'other_name' ? 'other_name'
                    : null;
          if (!col) continue;
          await conn.execute(
            `UPDATE people SET ${col} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [c.new_value, c.person_id],
          );
          await conn.execute(
            `UPDATE name_repair_changes SET applied_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [c.id],
          );
        }
        await conn.execute(
          `UPDATE name_repair_sessions SET status='applied', applied_rows=?, applied_at=CURRENT_TIMESTAMP WHERE id = ?`,
          [changes.length, sessionId],
        );
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }

      return NextResponse.json({ success: true, applied_count: changes.length });
    } finally {
      await conn.end();
    }
  }

  // ── ROLLBACK ────────────────────────────────────────────────────────────
  if (mode === 'rollback') {
    const sessionId = Number(formData.get('session_id'));
    if (!sessionId) return NextResponse.json({ success: false, error: 'session_id required' }, { status: 400 });

    const conn = await getConnection();
    try {
      const [sessRows] = await conn.execute<any[]>(
        `SELECT id, status FROM name_repair_sessions WHERE id = ? AND school_id = ?`,
        [sessionId, schoolId],
      );
      if (sessRows.length === 0) return NextResponse.json({ success: false, error: 'session not found' }, { status: 404 });
      if (sessRows[0].status !== 'applied') {
        return NextResponse.json({ success: false, error: `cannot rollback a session in '${sessRows[0].status}' state` }, { status: 409 });
      }

      const [changes] = await conn.execute<any[]>(
        `SELECT id, person_id, field_name, old_value
           FROM name_repair_changes
          WHERE session_id = ? AND school_id = ? AND reverted_at IS NULL`,
        [sessionId, schoolId],
      );

      await conn.beginTransaction();
      try {
        for (const c of changes) {
          const col = c.field_name === 'first_name' ? 'first_name'
                    : c.field_name === 'last_name'  ? 'last_name'
                    : c.field_name === 'other_name' ? 'other_name'
                    : null;
          if (!col) continue;
          await conn.execute(
            `UPDATE people SET ${col} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [c.old_value, c.person_id],
          );
          await conn.execute(
            `UPDATE name_repair_changes SET reverted_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [c.id],
          );
        }
        await conn.execute(
          `UPDATE name_repair_sessions
              SET status='rolled_back', rolled_back_at=CURRENT_TIMESTAMP, rolled_back_by=?
            WHERE id = ?`,
          [actorUserId, sessionId],
        );
        await conn.commit();
      } catch (e) {
        await conn.rollback();
        throw e;
      }

      return NextResponse.json({ success: true, reverted_count: changes.length });
    } finally {
      await conn.end();
    }
  }

  return NextResponse.json({ success: false, error: `unknown mode '${mode}'` }, { status: 400 });
}

// ─── GET — list sessions for the audit history view ────────────────────────
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;
  const conn = await getConnection();
  try {
    const [sessions] = await conn.execute<any[]>(
      `SELECT id, filename, total_rows, matched_rows, applied_rows, status,
              applied_at, rolled_back_at, created_at
         FROM name_repair_sessions
        WHERE school_id = ?
        ORDER BY created_at DESC
        LIMIT 100`,
      [schoolId],
    );
    return NextResponse.json({ success: true, sessions });
  } finally {
    await conn.end();
  }
}
