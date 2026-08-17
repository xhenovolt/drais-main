/**
 * POST /api/students/import — Smart Import Engine v2
 *
 * Modes (formData field: mode):
 *   preview        → parse file, normalise headers, detect columns, return preview rows
 *   validate       → full matching engine + per-row match stats — NO DB writes
 *   import         → SSE stream: chunked import with session tracking & cancel support
 *   cancel         → mark import session as cancelled (stops the running SSE loop)
 *   session-status → return live status / progress of a session
 *   create-class   → quick-create a missing class inline
 *   create-stream  → quick-create a missing stream inline
 *
 * Import options (formData booleans, all default true except feesOnly & reassignClass):
 *   updateExisting  — update fields on matched students (name, demographics,
 *                     registration number, fees) — NEVER inserts a duplicate
 *   createNew       — create students that had no match
 *   feesOnly        — ONLY update fees_balance, skip all student creation/update
 *   enrollNew       — auto-enroll newly created students
 *   reassignClass   — opt-in (default FALSE): allow moving an already-enrolled
 *                     matched student to a different class/stream. When off, an
 *                     existing active enrollment is PRESERVED, never overridden;
 *                     a matched student with no active enrollment still gets one.
 *
 * Matching priority (strict order):
 *   1. admission_no  → EXACT_MATCH
 *   2. name + class  → PARTIAL_MATCH (1 hit) | AMBIGUOUS (>1 hit)
 *   3. none found    → NO_MATCH
 *
 * SSE events:
 *   { type:'session',   session_id }
 *   { type:'progress',  imported, updated, failed, skipped, total, current_name, chunk, session_id }
 *   { type:'complete',  imported, updated, skipped, failed, errors[], failedRows[], total, message, session_id }
 *   { type:'cancelled', message, processed, session_id }
 *   { type:'error',     message }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { execTenant } from '@/lib/dbTenant';
import * as XLSX from 'xlsx';
import { getSessionSchoolId } from '@/lib/auth';
import { getLimitState, LIMIT_LABELS } from '@/lib/entitlements/limits';

const CHUNK_SIZE = 50;

// ─── Pure helpers ──────────────────────────────────────────────────────────────

function safe(v: any): string | null {
  return (v === undefined || v === '' || v === null) ? null : String(v).trim() || null;
}

/** Normalise a name for matching: uppercase, collapse spaces */
function normaliseName(first: string, last: string): string {
  return `${first} ${last}`.toUpperCase().replace(/\s+/g, ' ').trim();
}

function parseCSV(csvContent: string): string[][] {
  const lines = csvContent.trim().split('\n');
  const rows: string[][] = [];
  for (const line of lines) {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      if (char === '"') {
        if (inQuotes && nextChar === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim()); current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  return rows;
}

// ─── Column mapper ─────────────────────────────────────────────────────────────

interface ColMap {
  nameIdx: number; firstNameIdx: number; lastNameIdx: number;
  otherNameIdx: number;
  regNoIdx: number; classIdx: number; sectionIdx: number;
  genderIdx: number; dobIdx: number; phoneIdx: number;
  addressIdx: number; photoUrlIdx: number; biometricIdIdx: number;
  feesBalanceIdx: number;
}

/**
 * Whether `mapColumns` collapsed two distinct learner-name fields onto
 * the same source column. When true, the import MUST refuse the row
 * rather than silently writing `first_name == last_name` (the bug that
 * produced "Kalungi Kalungi" etc.). Exposed on the preview payload so
 * the UI can surface it and force the operator to remap.
 */
export interface ColMapDiagnostics {
  /** First/last/other share a source — the collision pattern. */
  nameCollision: boolean;
  /** Which canonical fields collided. */
  collidedFields: string[];
  /** Headers that look like name columns but were not mapped. */
  unmappedNameHeaders: string[];
}

function mapColumns(headers: string[], overrides?: Record<string, string>): ColMap {
  // Normalise headers: lowercase + spaces→underscores
  const h = headers.map(x => String(x || '').toLowerCase().trim().replace(/[\s\-]+/g, '_'));

  if (overrides && Object.keys(overrides).length > 0) {
    const findOverride = (key: string) => {
      const mapped = overrides[key];
      if (!mapped) return -1;
      return h.indexOf(mapped.toLowerCase().trim().replace(/[\s\-]+/g, '_'));
    };
    return {
      nameIdx:        findOverride('name'),
      firstNameIdx:   findOverride('first_name'),
      lastNameIdx:    findOverride('last_name'),
      otherNameIdx:   findOverride('other_name'),
      regNoIdx:       findOverride('reg_no'),
      classIdx:       findOverride('class'),
      sectionIdx:     findOverride('section'),
      genderIdx:      findOverride('gender'),
      dobIdx:         findOverride('date_of_birth'),
      phoneIdx:       findOverride('phone'),
      addressIdx:     findOverride('address'),
      photoUrlIdx:    findOverride('photo_url'),
      biometricIdIdx: findOverride('biometric_id'),
      feesBalanceIdx: findOverride('fees_balance'),
    };
  }

  // EXACT detection — pass-1: equality, pass-2: equality with separators
  // stripped. The previous pass-2 used `.includes(term)` which caused the
  // catastrophic 'name' bucket to swallow 'first_name' and 'last_name' —
  // the exact bug that produced first_name == last_name records.
  // See PHASE 1A audit report for the trace.
  const findExact = (...terms: string[]) => {
    for (const t of terms) {
      const idx = h.findIndex(x => x === t || x.replace(/[_\s-]/g, '') === t.replace(/[_\s-]/g, ''));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  // Loose match used ONLY for non-name fields where collision is harmless.
  const findLoose = (...terms: string[]) => {
    const exact = findExact(...terms);
    if (exact !== -1) return exact;
    for (const t of terms) {
      const idx = h.findIndex(x => x.includes(t));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  // Name fields use STRICT EXACT matching for first/last/other to avoid
  // the includes() collision bug (PHASE 1A audit). The full-name bucket
  // (`nameIdx`) gets a wider net because it represents the
  // "single column with both names" pattern that real Ugandan school
  // exports overwhelmingly use:
  //   - Name                                        (bare)
  //   - Names / Student Name / Student Names
  //   - Pupil Name / Learner Name / Candidate Name
  //   - Full Name / Names of Student / Name of Learner
  // …with values like "Kalungi Steven" which `getNames` splits below.
  let nameIdx      = findExact(
    'name', 'names',
    'full_name', 'fullname', 'full_names', 'fullnames',
    'student_name', 'studentname', 'student_names', 'studentnames',
    'learner_name', 'learnername', 'learner_names', 'learnernames',
    'pupil_name', 'pupilname', 'pupil_names', 'pupilnames',
    'candidate_name', 'candidatename', 'candidate_names', 'candidatenames',
  );
  let firstNameIdx = findExact('first_name', 'firstname', 'given_name', 'givenname', 'fname', 'first', 'firstnames', 'first_names');
  let lastNameIdx  = findExact('last_name', 'lastname', 'surname', 'family_name', 'familyname', 'lname', 'last', 'lastnames', 'last_names');
  const otherNameIdx = findExact('other_name', 'othername', 'middle_name', 'middlename', 'mname', 'other', 'middle');

  // GATED LOOSE MATCH for the full-name bucket. Fires ONLY when strict
  // matching missed. Catches creative real-world headers like:
  //   - "Names of pupil"
  //   - "Learner Full Name"
  //   - "Student's Name"
  // Excludes anything that looks like first/last/other or a non-learner
  // name (mother / father / guardian / parent / next of kin / former
  // school name). This is safe because the explicit first/last/other
  // detection already ran above and will win on collision via the
  // guards further down.
  if (nameIdx === -1) {
    const excluded = /(first|last|sur(?!a)|given|family|other|middle|mother|father|guardian|parent|next_of_kin|kin|prev|previous|former|school|account|user|company)/;
    nameIdx = h.findIndex(x => x.includes('name') && !excluded.test(x));
  }

  // DUPLICATE-HEADER PROMOTION. Real-world export files often label two
  // adjacent columns identically — e.g. `name, name` meaning first +
  // last. We disambiguated them upstream (the second becomes `name_2`,
  // a third becomes `name_3`, …), so we look for that suffix pattern
  // here. When first/last would otherwise be empty AND a `<stem>_2`
  // sibling of the `name` column exists, promote the pair to
  // first_name = name, last_name = name_2.
  const stem = (s: string) => s.replace(/_\d+$/, '');
  if (nameIdx !== -1 && firstNameIdx === -1 && lastNameIdx === -1) {
    const here = h[nameIdx];
    const sibling2 = h.findIndex((x, i) => i !== nameIdx && stem(x) === stem(here) && /_\d+$/.test(x));
    if (sibling2 !== -1) {
      firstNameIdx = nameIdx;
      lastNameIdx  = sibling2;
      nameIdx      = -1;
    }
  }

  // Defence-in-depth: if any two name buckets STILL resolved to the
  // same column index, blank out the lower-priority one. first/last
  // win over the generic 'name' bucket because they're more specific.
  if (nameIdx !== -1 && (nameIdx === firstNameIdx || nameIdx === lastNameIdx || nameIdx === otherNameIdx)) {
    nameIdx = -1;
  }
  if (firstNameIdx !== -1 && firstNameIdx === lastNameIdx) {
    // True collision between first and last — we refuse to guess. Drop
    // both; the preview will surface this and force the operator to
    // remap explicitly.
    firstNameIdx = -1;
    lastNameIdx  = -1;
  }

  return {
    nameIdx,
    firstNameIdx,
    lastNameIdx,
    otherNameIdx,
    regNoIdx:       findLoose('reg_no', 'regno', 'admission_no', 'adm_no', 'registration'),
    classIdx:       findLoose('class', 'class_name', 'grade'),
    sectionIdx:     findLoose('section', 'stream', 'division'),
    genderIdx:      findLoose('gender', 'sex'),
    dobIdx:         findLoose('date_of_birth', 'dob', 'birth_date', 'birthday'),
    phoneIdx:       findLoose('phone', 'phone_no', 'mobile', 'contact'),
    addressIdx:     findLoose('address', 'home_address'),
    photoUrlIdx:    findLoose('photo_url', 'photo', 'image_url'),
    biometricIdIdx: findLoose('biometric_id', 'biometric', 'device_id'),
    feesBalanceIdx: findLoose('fees_balance', 'feesbalance', 'balance', 'fee_balance', 'fees', 'amount_due', 'outstanding'),
  };
}

/**
 * Inspect a ColMap for the failure modes that produced production
 * corruption. Surfaced via the preview JSON so the UI can block import.
 */
function diagnoseColMap(headers: string[], cm: ColMap): ColMapDiagnostics {
  const collidedFields: string[] = [];
  if (cm.firstNameIdx !== -1 && cm.firstNameIdx === cm.lastNameIdx) {
    collidedFields.push('first_name', 'last_name');
  }
  if (cm.nameIdx !== -1 && (cm.nameIdx === cm.firstNameIdx || cm.nameIdx === cm.lastNameIdx)) {
    collidedFields.push('name', cm.nameIdx === cm.firstNameIdx ? 'first_name' : 'last_name');
  }
  const h = headers.map(x => String(x || '').toLowerCase().trim());
  const nameLike = (s: string) => /\b(name|surname|fname|lname|firstname|lastname|givenname|familyname)\b/.test(s)
    || s === 'name' || s.endsWith(' name') || s.startsWith('name ');
  const mappedSet = new Set<number>([cm.nameIdx, cm.firstNameIdx, cm.lastNameIdx, cm.otherNameIdx].filter(i => i !== -1));
  const unmappedNameHeaders = h
    .map((label, idx) => ({ label: headers[idx], idx, isName: nameLike(label) }))
    .filter(o => o.isName && !mappedSet.has(o.idx))
    .map(o => String(o.label || ''));
  return {
    nameCollision: collidedFields.length > 0,
    collidedFields: Array.from(new Set(collidedFields)),
    unmappedNameHeaders,
  };
}

/**
 * Read learner names from a row using the resolved column map.
 *
 * SAFETY: if `firstNameIdx` / `lastNameIdx` are present, they win over
 * the generic `nameIdx`. The previous behaviour preferred `nameIdx`
 * which caused the collapsed first_name == last_name corruption. The
 * fallback split of a single "full name" column is kept ONLY when no
 * dedicated first/last column was detected.
 */
function getNames(row: any[], cm: ColMap): { firstName: string; lastName: string; otherName: string | null } {
  const cell = (idx: number) => idx !== -1 ? String(row[idx] ?? '').trim() : '';
  const otherName = cell(cm.otherNameIdx) || null;

  // Dedicated first/last columns ALWAYS win when present.
  if (cm.firstNameIdx !== -1 || cm.lastNameIdx !== -1) {
    return { firstName: cell(cm.firstNameIdx), lastName: cell(cm.lastNameIdx), otherName };
  }

  // Fallback: split a single "full name" column on whitespace.
  if (cm.nameIdx !== -1 && row[cm.nameIdx]) {
    const parts = String(row[cm.nameIdx]).trim().split(/\s+/).filter(Boolean);
    const explicitOther = otherName; // explicit other_name col always wins
    if (parts.length === 0) {
      return { firstName: '', lastName: '', otherName: explicitOther };
    }
    if (parts.length === 1) {
      // 1 token only: it goes in last_name (the surname-only convention
      // used by many UG schools), first_name stays empty so the
      // operator can complete it manually. We deliberately DO NOT
      // duplicate the value into both fields — that was the original
      // corruption pattern.
      return { firstName: '', lastName: parts[0], otherName: explicitOther };
    }
    if (parts.length === 2) {
      // "Kalungi Steven" → first=Kalungi, last=Steven.
      return { firstName: parts[0], lastName: parts[1], otherName: explicitOther };
    }
    // 3+ tokens: "Kalungi Steven Muwanga" → first=Kalungi,
    // other=Steven, last=Muwanga. This is the common Ugandan
    // three-name pattern; preserves the middle name as other_name
    // rather than smushing it into last_name. The explicit
    // other_name column still wins if the file has one.
    return {
      firstName: parts[0],
      lastName:  parts[parts.length - 1],
      otherName: explicitOther ?? parts.slice(1, -1).join(' '),
    };
  }

  return { firstName: '', lastName: '', otherName };
}

// ─── Matching engine ───────────────────────────────────────────────────────────

type MatchResult = 'EXACT_MATCH' | 'PARTIAL_MATCH' | 'NO_MATCH' | 'AMBIGUOUS';

interface StudentRecord {
  id: number;
  person_id: number;
  admission_no: string | null;
  class_id: number | null;
  norm_name: string;
}

class MatchingEngine {
  private byAdmNo         = new Map<string, StudentRecord>();
  private byNormNameClass = new Map<string, StudentRecord[]>();

  load(students: any[]): void {
    for (const r of students) {
      const rec: StudentRecord = {
        id: r.id,
        person_id: r.person_id,
        admission_no: r.admission_no ?? null,
        class_id: r.class_id ?? null,
        norm_name: String(r.norm_name || ''),
      };
      if (rec.admission_no) {
        this.byAdmNo.set(rec.admission_no.toLowerCase().trim(), rec);
      }
      const key = `${rec.norm_name}:${rec.class_id ?? ''}`;
      if (!this.byNormNameClass.has(key)) this.byNormNameClass.set(key, []);
      this.byNormNameClass.get(key)!.push(rec);
    }
  }

  match(
    admNo: string | null,
    firstName: string,
    lastName: string,
    classId: number | null,
  ): { result: MatchResult; student?: StudentRecord } {
    // Priority 1: admission_no (exact)
    if (admNo) {
      const found = this.byAdmNo.get(admNo.toLowerCase().trim());
      if (found) return { result: 'EXACT_MATCH', student: found };
    }

    // Priority 2: normalised name + class
    const norm = normaliseName(firstName, lastName);
    if (!norm) return { result: 'NO_MATCH' };

    const key = `${norm}:${classId ?? ''}`;
    const hits = this.byNormNameClass.get(key) ?? [];

    if (hits.length === 1)  return { result: 'PARTIAL_MATCH', student: hits[0] };
    if (hits.length > 1)    return { result: 'AMBIGUOUS' };

    // Also try without class (looser match, still PARTIAL)
    const keyNoClass = `${norm}:`;
    const hitsNoClass = this.byNormNameClass.get(keyNoClass) ?? [];
    if (hitsNoClass.length === 1) return { result: 'PARTIAL_MATCH', student: hitsNoClass[0] };
    if (hitsNoClass.length > 1)   return { result: 'AMBIGUOUS' };

    return { result: 'NO_MATCH' };
  }
}

// ─── Session helpers ───────────────────────────────────────────────────────────
// Readiness-audit Phase A: these previously swallowed every failure in an
// empty catch{}, so a missing/broken import_sessions/import_errors table
// made an import invisible after the fact with nothing surfaced anywhere.
// Now they log loudly (once per session, not once per row — a broken
// tracking table on a 5,000-row import must not spam 5,000 log lines) and
// still let the import itself proceed unaffected. A tracking-table failure
// is a Sentinel-worthy condition, not a reason to fail someone's import.
const warnedOnce = new Set<string>();
function warnTrackingFailure(fn: string, sessionId: number | null, err: unknown) {
  const key = `${fn}:${sessionId ?? 'no-session'}`;
  if (warnedOnce.has(key)) return;
  warnedOnce.add(key);
  console.error(`[students/import] import-session tracking failed in ${fn} (session=${sessionId ?? 'none'}) — the import itself will proceed, but this run has NO session/error audit trail:`, err);
}

async function tryCreateSession(
  conn: any, schoolId: number, userId: number,
  filename: string, totalRows: number, options: object,
): Promise<number | null> {
  try {
    const [r] = await conn.execute(
      `INSERT INTO import_sessions (school_id, user_id, filename, total_rows, status, options)
       VALUES (?, ?, ?, ?, 'running', ?)`,
      [schoolId, userId, filename, totalRows, JSON.stringify(options)],
    ) as any[];
    return (r as any).insertId ?? null;
  } catch (err) {
    warnTrackingFailure('tryCreateSession', null, err); // table not yet migrated, or a real failure — either way, surfaced now
    return null;
  }
}

async function tryUpdateSession(
  conn: any, sessionId: number | null,
  fields: Partial<{ processed_rows: number; created_count: number; updated_count: number; skipped_count: number; failed_count: number; status: string }>,
): Promise<void> {
  if (!sessionId) return;
  try {
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    const vals = [...Object.values(fields), sessionId];
    await conn.execute(`UPDATE import_sessions SET ${sets} WHERE id = ?`, vals);
  } catch (err) {
    warnTrackingFailure('tryUpdateSession', sessionId, err);
  }
}

async function tryLogError(
  conn: any, sessionId: number | null, rowNumber: number, reason: string, rawData: any[],
): Promise<void> {
  if (!sessionId) return;
  try {
    await conn.execute(
      `INSERT INTO import_errors (session_id, row_number, reason, raw_data) VALUES (?, ?, ?, ?)`,
      [sessionId, rowNumber, reason.slice(0, 499), JSON.stringify(rawData)],
    );
  } catch (err) {
    warnTrackingFailure('tryLogError', sessionId, err);
  }
}

async function tryCheckCancelled(conn: any, sessionId: number | null): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const [rows] = await conn.execute(
      `SELECT status FROM import_sessions WHERE id = ? LIMIT 1`,
      [sessionId],
    ) as any[];
    return (rows as any[])[0]?.status === 'cancelled';
  } catch (err) {
    warnTrackingFailure('tryCheckCancelled', sessionId, err);
    return false; // fail open — an unreadable cancel flag should never itself abort the import
  }
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;
  const userId   = session.userId;

  const formData = await request.formData();
  const mode     = (formData.get('mode') as string | null) || 'import';

  // ── CANCEL SESSION ──────────────────────────────────────────────────────────
  if (mode === 'cancel') {
    const rawId = formData.get('session_id');
    const sessionId = rawId ? parseInt(String(rawId), 10) : 0;
    if (!sessionId) return NextResponse.json({ success: false, error: 'session_id required' }, { status: 400 });
    let conn: any;
    try {
      conn = await getConnection();
      await conn.execute(
        `UPDATE import_sessions SET status = 'cancelled' WHERE id = ? AND school_id = ?`,
        [sessionId, schoolId],
      );
      return NextResponse.json({ success: true, cancelled: true });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    } finally {
      if (conn) { try { await conn.end(); } catch {} }
    }
  }

  // ── SESSION STATUS ──────────────────────────────────────────────────────────
  if (mode === 'session-status') {
    const rawId = formData.get('session_id');
    const sessionId = rawId ? parseInt(String(rawId), 10) : 0;
    if (!sessionId) return NextResponse.json({ success: false, error: 'session_id required' }, { status: 400 });
    let conn: any;
    try {
      conn = await getConnection();
      const [rows] = await conn.execute(
        `SELECT * FROM import_sessions WHERE id = ? AND school_id = ? LIMIT 1`,
        [sessionId, schoolId],
      ) as any[];
      const row = (rows as any[])[0];
      if (!row) return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
      return NextResponse.json({ success: true, session: row });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    } finally {
      if (conn) { try { await conn.end(); } catch {} }
    }
  }

  // ── QUICK-CREATE CLASS ──────────────────────────────────────────────────────
  if (mode === 'create-class') {
    const name = (formData.get('name') as string || '').trim();
    if (!name) return NextResponse.json({ success: false, error: 'Class name is required' }, { status: 400 });
    let conn: any;
    try {
      conn = await getConnection();
      const [existing] = await conn.execute(
        'SELECT id FROM classes WHERE school_id = ? AND LOWER(name) = ?',
        [schoolId, name.toLowerCase()],
      ) as any[];
      if ((existing as any[]).length > 0) {
        return NextResponse.json({ success: true, id: (existing as any[])[0].id, name, existed: true });
      }
      const result = await execTenant(conn,
        'INSERT INTO classes (school_id, name) VALUES (?, ?)',
        [schoolId, name], schoolId,
      );
      return NextResponse.json({ success: true, id: result.insertId, name, existed: false });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    } finally {
      if (conn) { try { await conn.end(); } catch {} }
    }
  }

  // ── QUICK-CREATE STREAM ─────────────────────────────────────────────────────
  if (mode === 'create-stream') {
    const name    = (formData.get('name') as string || '').trim();
    const classId = parseInt(formData.get('class_id') as string || '0', 10);
    if (!name || !classId) return NextResponse.json({ success: false, error: 'name and class_id required' }, { status: 400 });
    let conn: any;
    try {
      conn = await getConnection();
      const [existing] = await conn.execute(
        'SELECT id FROM streams WHERE school_id = ? AND class_id = ? AND LOWER(name) = ?',
        [schoolId, classId, name.toLowerCase()],
      ) as any[];
      if ((existing as any[]).length > 0) {
        return NextResponse.json({ success: true, id: (existing as any[])[0].id, name, existed: true });
      }
      const result = await execTenant(conn,
        'INSERT INTO streams (school_id, class_id, name) VALUES (?, ?, ?)',
        [schoolId, classId, name], schoolId,
      );
      return NextResponse.json({ success: true, id: result.insertId, name, existed: false });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    } finally {
      if (conn) { try { await conn.end(); } catch {} }
    }
  }

  // ── FILE PARSING (shared: preview, validate, import) ───────────────────────
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });

  let rows: string[][] = [];
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    if (file.name.endsWith('.csv') || file.type === 'text/csv') {
      rows = parseCSV(buffer.toString('utf-8'));
    } else if (
      file.name.endsWith('.xlsx') || file.name.endsWith('.xls') ||
      file.type.includes('spreadsheetml') || file.type.includes('ms-excel')
    ) {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as string[][];
    } else {
      return NextResponse.json({ success: false, error: 'Unsupported format. Use .csv or .xlsx' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to parse file. Check format.' }, { status: 400 });
  }

  if (rows.length < 2) return NextResponse.json({ success: false, error: 'File has no data rows' }, { status: 400 });

  // Normalise headers: lowercase + trim + spaces→underscores.
  // ALSO disambiguate duplicates — many real-world export files label
  // two adjacent columns identically (e.g. "name", "name" meaning
  // first + last). Without disambiguation, the operator's column-map
  // override can't tell the two apart (both would post the same string
  // and resolve via `headers.indexOf(...)` to only the first one).
  // Suffix repeats with " (2)", " (3)", … so each column has a unique
  // identifier.
  const rawHeaders  = rows[0] || [];
  const headers     = (() => {
    const seen = new Map<string, number>();
    return rawHeaders.map(h => {
      const norm = String(h || '').toLowerCase().trim().replace(/[\s\-]+/g, '_');
      const n = (seen.get(norm) || 0) + 1;
      seen.set(norm, n);
      return n === 1 ? norm : `${norm}_${n}`;
    });
  })();
  const dataRows    = rows.slice(1).filter(r => r.some(c => c !== '' && c != null));

  const overridesRaw = formData.get('columnMapping') as string | null;
  let overrides: Record<string, string> | undefined;
  if (overridesRaw) { try { overrides = JSON.parse(overridesRaw); } catch {} }

  const cm = mapColumns(headers, overrides);
  const colMapDiagnostics = diagnoseColMap(headers, cm);

  const warnings: string[] = [];
  if (cm.nameIdx === -1 && cm.firstNameIdx === -1 && cm.lastNameIdx === -1) {
    return NextResponse.json({
      success: false,
      error: `Missing learner name column. Found: ${headers.join(', ')}`,
      diagnostics: colMapDiagnostics,
    }, { status: 400 });
  }
  // HARD BLOCK: if the auto-detected mapping collided two name fields
  // onto the same column (the "Kalungi Kalungi" corruption pattern),
  // refuse to proceed. The UI gets the diagnostics + must re-POST with
  // an explicit `columnMapping` override.
  if (colMapDiagnostics.nameCollision && !overrides) {
    return NextResponse.json({
      success: false,
      error: `Multiple learner name fields are mapped to the same source column: ${colMapDiagnostics.collidedFields.join(', ')}. Map them explicitly to continue.`,
      diagnostics: colMapDiagnostics,
      fileHeaders: headers,
    }, { status: 409 });
  }
  if (cm.classIdx === -1)       warnings.push('No "class" column — students will be imported without class enrollment');
  if (cm.genderIdx === -1)      warnings.push('No "gender" column detected');
  if (cm.feesBalanceIdx === -1) warnings.push('No "fees_balance" column — fees will not be set');
  if (cm.regNoIdx === -1)       warnings.push('No "reg_no" column — matching will fall back to name+class; system will auto-generate admission numbers');

  // ── PREVIEW MODE ─────────────────────────────────────────────────────────────
  if (mode === 'preview') {
    // Detect which class/stream names referenced in the file do NOT exist
    // yet in this school. We surface them to the user so they can batch-
    // create everything in ONE click before importing — preventing the
    // 'import succeeded but learners have no enrolment' silent failure
    // mode.
    let existingClasses = new Set<string>();
    let existingStreamsByClass = new Map<string, Set<string>>();
    let connPreview: any;
    try {
      connPreview = await getConnection();
      const [rawClasses] = await connPreview.execute(
        'SELECT id, LOWER(name) AS name FROM classes WHERE school_id = ?',
        [schoolId],
      ) as any[];
      for (const c of rawClasses as any[]) existingClasses.add(c.name);
      const [rawStreams] = await connPreview.execute(
        `SELECT LOWER(s.name) AS s_name, LOWER(c.name) AS c_name
           FROM streams s JOIN classes c ON c.id = s.class_id
          WHERE s.school_id = ?`,
        [schoolId],
      ) as any[];
      for (const r of rawStreams as any[]) {
        if (!existingStreamsByClass.has(r.c_name)) existingStreamsByClass.set(r.c_name, new Set());
        existingStreamsByClass.get(r.c_name)!.add(r.s_name);
      }
    } catch { /* schema not yet migrated — treat as no classes */ }
    finally { if (connPreview) { try { await connPreview.end(); } catch {} } }

    const missingClassesSet = new Set<string>();
    const missingStreamsSet = new Set<string>();
    if (cm.classIdx !== -1) {
      for (const row of dataRows) {
        const className = safe(row[cm.classIdx]);
        if (!className) continue;
        const lower = className.toLowerCase();
        if (!existingClasses.has(lower)) {
          missingClassesSet.add(className); // preserve original casing for display
          continue;
        }
        if (cm.sectionIdx !== -1) {
          const stream = safe(row[cm.sectionIdx]);
          if (!stream) continue;
          const streamLower = stream.toLowerCase();
          const classStreams = existingStreamsByClass.get(lower);
          if (!classStreams || !classStreams.has(streamLower)) {
            missingStreamsSet.add(`${className}::${stream}`);
          }
        }
      }
    }
    const missingClasses = Array.from(missingClassesSet).sort();
    const missingStreams = Array.from(missingStreamsSet).sort().map(s => {
      const [cls, stream] = s.split('::');
      return { class: cls, stream };
    });

    const preview = dataRows.slice(0, 10).map((row, i) => {
      const { firstName, lastName } = getNames(row, cm);
      const obj: Record<string, string> = {
        '#':      String(i + 1),
        name:     `${firstName} ${lastName}`.trim() || '(empty)',
        reg_no:   cm.regNoIdx    !== -1 ? (row[cm.regNoIdx]    || '—') : '—',
        class:    cm.classIdx    !== -1 ? (row[cm.classIdx]    || '—') : '—',
        section:  cm.sectionIdx  !== -1 ? (row[cm.sectionIdx]  || '—') : '—',
        gender:   cm.genderIdx   !== -1 ? (row[cm.genderIdx]   || '—') : '—',
      };
      if (cm.feesBalanceIdx !== -1) obj.fees_balance = row[cm.feesBalanceIdx] || '—';
      return obj;
    });

    const systemFields = [
      { key: 'name',          mapped: cm.nameIdx        >= 0 ? headers[cm.nameIdx]        : null },
      { key: 'first_name',    mapped: cm.firstNameIdx   >= 0 ? headers[cm.firstNameIdx]   : null },
      { key: 'last_name',     mapped: cm.lastNameIdx    >= 0 ? headers[cm.lastNameIdx]    : null },
      { key: 'other_name',    mapped: cm.otherNameIdx   >= 0 ? headers[cm.otherNameIdx]   : null },
      { key: 'reg_no',        mapped: cm.regNoIdx       >= 0 ? headers[cm.regNoIdx]       : null },
      { key: 'class',         mapped: cm.classIdx       >= 0 ? headers[cm.classIdx]       : null },
      { key: 'section',       mapped: cm.sectionIdx     >= 0 ? headers[cm.sectionIdx]     : null },
      { key: 'gender',        mapped: cm.genderIdx      >= 0 ? headers[cm.genderIdx]      : null },
      { key: 'date_of_birth', mapped: cm.dobIdx         >= 0 ? headers[cm.dobIdx]         : null },
      { key: 'phone',         mapped: cm.phoneIdx       >= 0 ? headers[cm.phoneIdx]       : null },
      { key: 'address',       mapped: cm.addressIdx     >= 0 ? headers[cm.addressIdx]     : null },
      { key: 'photo_url',     mapped: cm.photoUrlIdx    >= 0 ? headers[cm.photoUrlIdx]    : null },
      { key: 'biometric_id',  mapped: cm.biometricIdIdx >= 0 ? headers[cm.biometricIdIdx] : null },
      { key: 'fees_balance',  mapped: cm.feesBalanceIdx >= 0 ? headers[cm.feesBalanceIdx] : null },
    ];
    const columnMapping: Record<string, string | null> = {};
    for (const f of systemFields) columnMapping[f.key] = f.mapped;

    const columnTypes: Record<string, string> = {};
    for (const h of headers) {
      const fieldEntry = systemFields.find(f => f.mapped === h);
      if (fieldEntry) {
        const key = fieldEntry.key;
        if (['name', 'first_name', 'last_name', 'address'].includes(key)) columnTypes[h] = 'text';
        else if (key === 'fees_balance') columnTypes[h] = 'number';
        else if (key === 'date_of_birth') columnTypes[h] = 'date';
        else if (key === 'gender') columnTypes[h] = 'enum';
        else columnTypes[h] = 'text';
      } else {
        columnTypes[h] = 'unmapped';
      }
    }

    return NextResponse.json({
      success: true, total: dataRows.length, preview, warnings,
      readyToImport: true, fileHeaders: headers, columnMapping, columnTypes,
      diagnostics: colMapDiagnostics,
      missingClasses, missingStreams,
    });
  }

  // ── VALIDATE MODE  ────────────────────────────────────────────────────────────
  // Returns full match analysis: EXACT / PARTIAL / NO_MATCH / AMBIGUOUS counts + per-row detail
  if (mode === 'validate') {
    let conn: any;
    try {
      conn = await getConnection();

      // Load reference data
      const [rawClasses] = await conn.execute('SELECT id, LOWER(name) as name FROM classes WHERE school_id = ?', [schoolId]) as any[];
      const [rawStreams] = await conn.execute('SELECT id, LOWER(name) as name, class_id FROM streams WHERE school_id = ?', [schoolId]) as any[];
      const classMap = new Map((rawClasses as any[]).map((c: any) => [c.name, c.id]));
      const streamNames = new Map<number, Set<string>>();
      for (const s of rawStreams as any[]) {
        if (!streamNames.has(s.class_id)) streamNames.set(s.class_id, new Set());
        streamNames.get(s.class_id)!.add(s.name);
      }

      // Load all students into engine. Defensive: deleted_at may not
      // exist on pre-migration schemas.
      let allStudents: any[];
      try {
        const [rows] = await conn.execute(
          `SELECT s.id, s.person_id, s.admission_no, s.class_id,
                  UPPER(TRIM(CONCAT_WS(' ', p.first_name, p.last_name))) AS norm_name
             FROM students s JOIN people p ON p.id = s.person_id
            WHERE s.school_id = ? AND s.deleted_at IS NULL`,
          [schoolId],
        ) as any[];
        allStudents = rows;
      } catch {
        const [rows] = await conn.execute(
          `SELECT s.id, s.person_id, s.admission_no, s.class_id,
                  UPPER(TRIM(CONCAT_WS(' ', p.first_name, p.last_name))) AS norm_name
             FROM students s JOIN people p ON p.id = s.person_id
            WHERE s.school_id = ?`,
          [schoolId],
        ) as any[];
        allStudents = rows;
      }
      const engine = new MatchingEngine();
      engine.load(allStudents as any[]);

      // Per-row analysis
      interface RowResult {
        rowNum: number;
        name: string;
        regNo: string;
        class: string;
        matchResult: MatchResult | 'INVALID';
        existingAdmNo?: string;
        issues: string[];
      }
      const rowResults: RowResult[] = [];
      const errors: { row: number; field: string; value: string; message: string }[] = [];
      const seenRegNos = new Map<string, number>();
      const missingClasses = new Set<string>();
      const missingStreams = new Set<string>();
      let exactMatches = 0, partialMatches = 0, noMatches = 0, ambiguous = 0, invalid = 0;

      for (let i = 0; i < dataRows.length; i++) {
        const row    = dataRows[i];
        const rowNum = i + 2;
        const issues: string[] = [];
        let hasError = false;

        const { firstName, lastName } = getNames(row, cm);
        const fullName = `${firstName} ${lastName}`.trim();

        if (!firstName && !lastName) {
          errors.push({ row: rowNum, field: 'name', value: '', message: 'Name is required' });
          invalid++;
          rowResults.push({ rowNum, name: '(empty)', regNo: '', class: '', matchResult: 'INVALID', issues: ['Name is required'] });
          continue;
        }

        const regNo     = cm.regNoIdx !== -1 ? safe(row[cm.regNoIdx]) : null;
        const className = cm.classIdx !== -1 ? safe(row[cm.classIdx]) : null;
        const classId   = className ? classMap.get(className.toLowerCase()) : null;

        // Duplicate reg_no check within file
        if (regNo) {
          const key = regNo.toLowerCase();
          if (seenRegNos.has(key)) {
            issues.push(`Duplicate reg_no in file (same as row ${seenRegNos.get(key)})`);
            errors.push({ row: rowNum, field: 'reg_no', value: regNo, message: issues[issues.length - 1] });
            hasError = true;
          } else {
            seenRegNos.set(key, rowNum);
          }
        }

        // Class validation
        if (className) {
          if (!classMap.has(className.toLowerCase())) {
            missingClasses.add(className);
            issues.push(`Class "${className}" does not exist (will be auto-created)`);
            errors.push({ row: rowNum, field: 'class', value: className, message: issues[issues.length - 1] });
          } else if (cm.sectionIdx !== -1) {
            const streamName = safe(row[cm.sectionIdx]);
            if (streamName && classId) {
              const classStreams = streamNames.get(classId);
              if (!classStreams || !classStreams.has(streamName.toLowerCase())) {
                missingStreams.add(`${className}:${streamName}`);
                issues.push(`Section "${streamName}" will be auto-created`);
              }
            }
          }
        } else {
          issues.push('Class is empty — student will have no enrollment');
        }

        // Fees validation
        if (cm.feesBalanceIdx !== -1) {
          const feesVal = safe(row[cm.feesBalanceIdx]);
          if (feesVal) {
            const parsed = parseFloat(feesVal.replace(/[,\s]/g, ''));
            if (isNaN(parsed)) {
              issues.push(`Non-numeric fees_balance: "${feesVal}"`);
              errors.push({ row: rowNum, field: 'fees_balance', value: feesVal, message: issues[issues.length - 1] });
              hasError = true;
            }
          }
        }

        if (hasError) {
          invalid++;
          rowResults.push({ rowNum, name: fullName, regNo: regNo || '', class: className || '', matchResult: 'INVALID', issues });
          continue;
        }

        // Run matching
        const { result, student } = engine.match(regNo, firstName, lastName, classId ?? null);

        if      (result === 'EXACT_MATCH')   exactMatches++;
        else if (result === 'PARTIAL_MATCH') partialMatches++;
        else if (result === 'NO_MATCH')      noMatches++;
        else                                  ambiguous++;

        if (result === 'AMBIGUOUS') {
          issues.push('AMBIGUOUS: multiple students with same name+class — will be skipped');
          errors.push({ row: rowNum, field: 'name', value: fullName, message: issues[issues.length - 1] });
        }

        rowResults.push({
          rowNum, name: fullName, regNo: regNo || '', class: className || '',
          matchResult: result,
          existingAdmNo: student?.admission_no ?? undefined,
          issues,
        });
      }

      return NextResponse.json({
        success: true,
        total:         dataRows.length,
        exactMatches,
        partialMatches,
        noMatches,
        ambiguous,
        invalid,
        valid:              dataRows.length - invalid,
        duplicateInSystem:  exactMatches + partialMatches,
        errors,
        rowFlags: rowResults.map(r =>
          r.matchResult === 'INVALID' ? 'error' : r.issues.length > 0 ? 'warning' : 'valid'
        ),
        matchResults: rowResults.slice(0, 500), // cap preview at 500 rows
        missingClasses: Array.from(missingClasses),
        missingStreams: Array.from(missingStreams).map(s => {
          const [cls, stream] = s.split(':');
          return { class: cls, stream };
        }),
        canProceed: invalid === 0 || (invalid < dataRows.length * 0.5),
      });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    } finally {
      if (conn) { try { await conn.end(); } catch {} }
    }
  }

  // ── IMPORT MODE — SSE stream ───────────────────────────────────────────────
  // Parse options
  const updateExisting = formData.get('updateExisting') !== 'false';
  const createNew      = formData.get('createNew')      !== 'false';
  const feesOnly       = formData.get('feesOnly')       === 'true';
  const enrollNew      = formData.get('enrollNew')      !== 'false';
  // Opt-in ("unless otherwise specified"): allow an import to MOVE a matched
  // student who ALREADY has an active enrollment into a different class/stream.
  // Default OFF — an import must never silently override an existing enrollment;
  // it only fills a gap when a matched student has no active enrollment.
  const reassignClass  = formData.get('reassignClass')  === 'true';
  const importOptions  = { updateExisting, createNew, feesOnly, enrollNew, reassignClass };

  // Retry mode: only specific rows
  const retryRaw = formData.get('retryIndices') as string | null;
  let retryIndices: Set<number> | null = null;
  if (retryRaw) {
    try { retryIndices = new Set(JSON.parse(retryRaw) as number[]); } catch {}
  }

  const importRows = retryIndices
    ? dataRows.filter((_, i) => retryIndices!.has(i + 2))
    : dataRows;

  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch {}
      };

      let conn: any;
      const stats = {
        imported: 0, updated: 0, skipped: 0, failed: 0,
        enrollmentsPreserved: 0,
        errors: [] as string[], failedRows: [] as number[],
      };

      // ── PLAN CAPACITY ─────────────────────────────────────────────────────
      // Read ONCE, then decremented locally as rows are created. Two reasons
      // it is not re-queried per row: a 1,000-row import would add 2,000
      // queries, and the count would shift under us mid-import anyway.
      //
      // Only the CREATE branch decrements this. That is what makes the rule
      // identity-aware rather than row-count-based: a school at 950/1000 that
      // uploads 40 existing learners plus 30 new ones consumes 30, not 70, so
      // re-importing the same roll stays possible forever. Charging by rows
      // would make routine re-imports impossible the moment a school neared
      // its ceiling.
      const capState  = await getLimitState(schoolId, 'learners');
      let   headroom  = (capState.limit === null || capState.used === null)
        ? Number.POSITIVE_INFINITY
        : Math.max(0, capState.limit - capState.used);
      let   capBlocked = 0;

      try {
        conn = await getConnection();

        // Load reference data
        const [rawClasses] = await conn.execute('SELECT id, LOWER(name) as name FROM classes WHERE school_id = ?', [schoolId]) as any[];
        const [rawStreams]  = await conn.execute('SELECT id, LOWER(name) as name, class_id FROM streams WHERE school_id = ?', [schoolId]) as any[];
        const [rawYears]   = await conn.execute(
          `SELECT id FROM academic_years WHERE school_id = ? ORDER BY (status = 'active') DESC, id DESC LIMIT 1`,
          [schoolId],
        ) as any[];
        const [rawTerms]   = await conn.execute(
          'SELECT id FROM terms WHERE school_id = ? ORDER BY is_active DESC, id DESC LIMIT 1',
          [schoolId],
        ) as any[];

        const classMap    = new Map((rawClasses as any[]).map((c: any) => [c.name, c.id]));
        const streamsByClass = new Map<number, Map<string, number>>();
        for (const s of rawStreams as any[]) {
          if (!streamsByClass.has(s.class_id)) streamsByClass.set(s.class_id, new Map());
          streamsByClass.get(s.class_id)!.set(s.name, s.id);
        }
        const yearId = (rawYears as any[])[0]?.id ?? null;
        const termId = (rawTerms as any[])[0]?.id ?? null;

        // Load matching engine. The `deleted_at IS NULL` filter requires
        // the Phase 1 soft-delete migration; pre-migration TiDB throws
        // "Unknown column 'deleted_at'". Fall back to the no-filter query
        // so imports work on either schema.
        let allStudents: any[];
        try {
          const [rows] = await conn.execute(
            `SELECT s.id, s.person_id, s.admission_no, s.class_id,
                    UPPER(TRIM(CONCAT_WS(' ', p.first_name, p.last_name))) AS norm_name
               FROM students s JOIN people p ON p.id = s.person_id
              WHERE s.school_id = ? AND s.deleted_at IS NULL`,
            [schoolId],
          ) as any[];
          allStudents = rows;
        } catch (err: any) {
          // Most likely: pre-migration schema. Retry without the filter.
          const [rows] = await conn.execute(
            `SELECT s.id, s.person_id, s.admission_no, s.class_id,
                    UPPER(TRIM(CONCAT_WS(' ', p.first_name, p.last_name))) AS norm_name
               FROM students s JOIN people p ON p.id = s.person_id
              WHERE s.school_id = ?`,
            [schoolId],
          ) as any[];
          allStudents = rows;
        }
        const engine = new MatchingEngine();
        engine.load(allStudents as any[]);

        // Create session
        const sessionId = await tryCreateSession(
          conn, schoolId, userId, file.name, importRows.length, importOptions,
        );
        send({ type: 'session', session_id: sessionId });

        // CHUNKED IMPORT LOOP
        for (let chunkStart = 0; chunkStart < importRows.length; chunkStart += CHUNK_SIZE) {

          // Cancel check — DB is the source of truth (works on serverless)
          if (await tryCheckCancelled(conn, sessionId)) {
            await tryUpdateSession(conn, sessionId, { status: 'cancelled', processed_rows: stats.imported + stats.updated + stats.skipped + stats.failed });
            send({
              type: 'cancelled',
              message: `Import cancelled at row ${stats.imported + stats.updated + stats.skipped + stats.failed} of ${importRows.length}`,
              processed: stats.imported + stats.updated + stats.skipped + stats.failed,
              session_id: sessionId,
            });
            return;
          }

          const chunk = importRows.slice(chunkStart, chunkStart + CHUNK_SIZE);

          for (let i = 0; i < chunk.length; i++) {
            const rowNum = retryIndices
              ? Array.from(retryIndices)[chunkStart + i]
              : chunkStart + i + 2;
            const row = chunk[i];

            try {
              const { firstName, lastName, otherName } = getNames(row, cm);
              if (!firstName && !lastName) {
                stats.errors.push(`Row ${rowNum}: missing name — skipped`);
                stats.skipped++;
                stats.failedRows.push(rowNum);
                await tryLogError(conn, sessionId, rowNum, 'Missing name', row);
                send({ type: 'progress', imported: stats.imported, updated: stats.updated, failed: stats.failed, skipped: stats.skipped, total: importRows.length, current_name: `Row ${rowNum} skipped (no name)`, chunk: Math.floor(chunkStart / CHUNK_SIZE) + 1, session_id: sessionId });
                continue;
              }

              const regNo    = cm.regNoIdx !== -1 ? safe(row[cm.regNoIdx]) : null;
              const className = cm.classIdx !== -1 ? safe(row[cm.classIdx]) : null;
              const classNameLower = className?.toLowerCase();
              const classId  = classNameLower ? classMap.get(classNameLower) ?? null : null;

              // ── MATCHING ENGINE ──────────────────────────────────────────────
              const { result: matchResult, student: matched } = engine.match(regNo, firstName, lastName, classId);

              // ── DECIDE ACTION ────────────────────────────────────────────────
              type Action = 'update' | 'fees_only' | 'create' | 'skip';
              let action: Action;
              let skipReason = '';

              if (matchResult === 'AMBIGUOUS') {
                action = 'skip';
                skipReason = 'AMBIGUOUS: multiple students with same name+class';
              } else if (feesOnly) {
                action = (matchResult === 'EXACT_MATCH' || matchResult === 'PARTIAL_MATCH') ? 'fees_only' : 'skip';
                if (action === 'skip') skipReason = 'feesOnly mode: student not found';
              } else if (matchResult === 'EXACT_MATCH' || matchResult === 'PARTIAL_MATCH') {
                action = updateExisting ? 'update' : 'skip';
                if (action === 'skip') skipReason = 'updateExisting disabled by user';
              } else {
                action = createNew ? 'create' : 'skip';
                if (action === 'skip') skipReason = 'createNew disabled by user';
              }

              if (action === 'skip') {
                stats.skipped++;
                if (skipReason.includes('AMBIGUOUS') || skipReason.includes('feesOnly')) {
                  stats.errors.push(`Row ${rowNum}: ${skipReason}`);
                  stats.failedRows.push(rowNum);
                  await tryLogError(conn, sessionId, rowNum, skipReason, row);
                }
                send({ type: 'progress', imported: stats.imported, updated: stats.updated, failed: stats.failed, skipped: stats.skipped, total: importRows.length, current_name: `${firstName} ${lastName} (skipped)`, chunk: Math.floor(chunkStart / CHUNK_SIZE) + 1, session_id: sessionId });
                continue;
              }

              // ── TRANSACTION ──────────────────────────────────────────────────
              await conn.beginTransaction();
              try {
                let studentId: number | null = matched?.id ?? null;

                if (action === 'update' && matched) {
                  // UPDATE existing student's person record
                  // other_name is COALESCE-merged: re-importing a file
                  // without a middle-name column must NOT clobber an
                  // already-stored other_name.
                  await execTenant(conn,
                    `UPDATE people SET
                       first_name    = ?,
                       last_name     = ?,
                       other_name    = COALESCE(?, other_name),
                       gender        = COALESCE(?, gender),
                       date_of_birth = COALESCE(?, date_of_birth),
                       phone         = COALESCE(?, phone),
                       address       = COALESCE(?, address),
                       photo_url     = COALESCE(?, photo_url),
                       updated_at    = CURRENT_TIMESTAMP
                     WHERE id = (SELECT person_id FROM students WHERE id = ? AND school_id = ?)`,
                    [
                      firstName, lastName, otherName,
                      safe(cm.genderIdx   !== -1 ? row[cm.genderIdx]   : null),
                      safe(cm.dobIdx      !== -1 ? row[cm.dobIdx]      : null),
                      safe(cm.phoneIdx    !== -1 ? row[cm.phoneIdx]    : null),
                      safe(cm.addressIdx  !== -1 ? row[cm.addressIdx]  : null),
                      safe(cm.photoUrlIdx !== -1 ? row[cm.photoUrlIdx] : null),
                      matched.id, schoolId,
                    ], schoolId,
                  );

                  // Registration number: adopt the number the import supplies
                  // when it differs from what's on file — but NEVER take a number
                  // another student already holds (would break uniqueness). If it
                  // clashes we keep the existing number and record a warning.
                  if (regNo && (matched.admission_no ?? null) !== regNo) {
                    const [clash] = await conn.execute(
                      `SELECT id FROM students
                         WHERE school_id = ? AND admission_no = ? AND id <> ? AND deleted_at IS NULL
                         LIMIT 1`,
                      [schoolId, regNo, matched.id],
                    ) as any[];
                    if ((clash as any[]).length === 0) {
                      await execTenant(conn,
                        `UPDATE students SET admission_no = ?, is_external_reg = 1, updated_at = CURRENT_TIMESTAMP
                           WHERE id = ? AND school_id = ?`,
                        [regNo, matched.id, schoolId], schoolId,
                      );
                    } else {
                      stats.errors.push(`Row ${rowNum}: reg no "${regNo}" already belongs to another student — kept existing number`);
                    }
                  }

                } else if (action === 'create') {
                  // Refuse only the NEW rows beyond the plan. Matched rows have
                  // already taken the update branch above, so an import that is
                  // mostly corrections still succeeds — the school is told which
                  // rows could not be admitted instead of the whole file failing.
                  if (headroom <= 0) {
                    capBlocked++;
                    stats.skipped++;
                    stats.errors.push(
                      `Row ${rowNum}: not created — plan limit of ${capState.limit} ${LIMIT_LABELS.learners} reached.`,
                    );
                    await conn.rollback();
                    continue;
                  }
                  headroom--;

                  // CREATE — person → student → enrollment (rolled back together on failure)
                  const year       = new Date().getFullYear();
                  const seq        = stats.imported + stats.updated + stats.skipped + 1;
                  const finalAdmNo = regNo ?? `XHN/${String(seq).padStart(4, '0')}/${year}`;
                  const isExternal = regNo !== null;
                  const notes      = `Bulk imported ${new Date().toISOString()}`;

                  // other_name is now persisted on create so middle/third
                  // name fields stop being silently dropped (the audit
                  // flagged this as Case 5 in Phase 0.5).
                  const pr = await execTenant(conn,
                    `INSERT INTO people (school_id, first_name, last_name, other_name, gender, date_of_birth, phone, address, photo_url)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      schoolId, firstName, lastName, otherName,
                      safe(cm.genderIdx   !== -1 ? row[cm.genderIdx]   : null),
                      safe(cm.dobIdx      !== -1 ? row[cm.dobIdx]      : null),
                      safe(cm.phoneIdx    !== -1 ? row[cm.phoneIdx]    : null),
                      safe(cm.addressIdx  !== -1 ? row[cm.addressIdx]  : null),
                      safe(cm.photoUrlIdx !== -1 ? row[cm.photoUrlIdx] : null),
                    ], schoolId,
                  );
                  const personId = pr.insertId;

                  const sr = await execTenant(conn,
                    `INSERT INTO students (school_id, person_id, admission_no, is_external_reg, status, notes)
                     VALUES (?, ?, ?, ?, 'active', ?)`,
                    [schoolId, personId, finalAdmNo, isExternal ? 1 : 0, notes], schoolId,
                  );
                  studentId = sr.insertId;

                  // ── ENROLLMENT GUARANTEE ──────────────────────────────────
                  // Runs inside the same transaction — rolls back student+person on failure
                  if (enrollNew && studentId && cm.classIdx !== -1 && row[cm.classIdx]) {
                    let resolvedClassId = classId;
                    if (!resolvedClassId) {
                      const [cr2] = await conn.execute(
                        'INSERT INTO classes (school_id, name) VALUES (?, ?)', [schoolId, className],
                      ) as any[];
                      resolvedClassId = (cr2 as any).insertId;
                      classMap.set(classNameLower!, resolvedClassId);
                      streamsByClass.set(resolvedClassId, new Map());
                    }

                    let streamId: number | null = null;
                    if (cm.sectionIdx !== -1 && row[cm.sectionIdx]) {
                      const strName  = String(row[cm.sectionIdx]).trim();
                      const strLower = strName.toLowerCase();
                      streamId = streamsByClass.get(resolvedClassId)?.get(strLower) ?? null;
                      if (!streamId) {
                        const [sr3] = await conn.execute(
                          'INSERT INTO streams (school_id, class_id, name) VALUES (?, ?, ?)',
                          [schoolId, resolvedClassId, strName],
                        ) as any[];
                        streamId = (sr3 as any).insertId;
                        if (!streamsByClass.has(resolvedClassId)) streamsByClass.set(resolvedClassId, new Map());
                        streamsByClass.get(resolvedClassId)!.set(strLower, streamId!);
                      }
                    }

                    await execTenant(conn,
                      `INSERT INTO enrollments (school_id, student_id, class_id, stream_id, academic_year_id, term_id, status)
                       VALUES (?, ?, ?, ?, ?, ?, 'active')
                       ON DUPLICATE KEY UPDATE class_id = VALUES(class_id), stream_id = VALUES(stream_id)`,
                      [schoolId, studentId, resolvedClassId, streamId, yearId, termId], schoolId,
                    );
                  }

                } // end 'create'

                // ── ENROLLMENT (existing student) — NEVER OVERRIDE BY DEFAULT ─
                // An import must not silently move an already-enrolled student to
                // a different class. So for a matched student we only:
                //   • fill a GAP — create an enrollment when they have no active
                //     one (this isn't an override); or
                //   • REASSIGN their existing enrollment ONLY when the operator
                //     explicitly opted in via reassignClass ("unless otherwise
                //     specified"). Otherwise the existing enrollment is preserved.
                if ((action === 'update') && studentId && cm.classIdx !== -1 && row[cm.classIdx]) {
                  const [activeRows] = await conn.execute(
                    `SELECT id FROM enrollments
                       WHERE student_id = ? AND school_id = ? AND status = 'active' AND deleted_at IS NULL
                       ORDER BY id DESC LIMIT 1`,
                    [studentId, schoolId],
                  ) as any[];
                  const activeEnrId: number | null = (activeRows as any[])[0]?.id ?? null;

                  if (activeEnrId && !reassignClass) {
                    // Preserve the existing enrollment exactly as it is.
                    stats.enrollmentsPreserved++;
                  } else {
                    let resolvedClassId = classId;
                    if (!resolvedClassId && className) {
                      const [cr3] = await conn.execute(
                        'INSERT INTO classes (school_id, name) VALUES (?, ?)', [schoolId, className],
                      ) as any[];
                      resolvedClassId = (cr3 as any).insertId;
                      classMap.set(classNameLower!, resolvedClassId);
                      streamsByClass.set(resolvedClassId, new Map());
                    }
                    if (resolvedClassId) {
                      let streamId: number | null = null;
                      if (cm.sectionIdx !== -1 && row[cm.sectionIdx]) {
                        const strName  = String(row[cm.sectionIdx]).trim();
                        const strLower = strName.toLowerCase();
                        streamId = streamsByClass.get(resolvedClassId)?.get(strLower) ?? null;
                        if (!streamId) {
                          const [sr4] = await conn.execute(
                            'INSERT INTO streams (school_id, class_id, name) VALUES (?, ?, ?)',
                            [schoolId, resolvedClassId, strName],
                          ) as any[];
                          streamId = (sr4 as any).insertId;
                          if (!streamsByClass.has(resolvedClassId)) streamsByClass.set(resolvedClassId, new Map());
                          streamsByClass.get(resolvedClassId)!.set(strLower, streamId!);
                        }
                      }
                      if (activeEnrId) {
                        // Explicit opt-in reassignment of the existing enrollment.
                        await execTenant(conn,
                          `UPDATE enrollments SET class_id = ?, stream_id = ?, updated_at = CURRENT_TIMESTAMP
                             WHERE id = ? AND school_id = ?`,
                          [resolvedClassId, streamId, activeEnrId, schoolId], schoolId,
                        );
                      } else {
                        // Fill the gap — the matched student had no active enrollment.
                        await execTenant(conn,
                          `INSERT INTO enrollments (school_id, student_id, class_id, stream_id, academic_year_id, term_id, status)
                           VALUES (?, ?, ?, ?, ?, ?, 'active')
                           ON DUPLICATE KEY UPDATE class_id = VALUES(class_id), stream_id = VALUES(stream_id)`,
                          [schoolId, studentId, resolvedClassId, streamId, yearId, termId], schoolId,
                        );
                      }
                    }
                  }
                }

                // ── FEES ─────────────────────────────────────────────────────
                // Fees are now inserted for ANY valid numeric value (including 0)
                // instead of skipping zero fees, which was causing the "all fees = 0" bug
                if (studentId && cm.feesBalanceIdx !== -1 && row[cm.feesBalanceIdx] && termId) {
                  const feesVal = parseFloat(String(row[cm.feesBalanceIdx]).replace(/[,\s]/g, ''));
                  if (!isNaN(feesVal) && feesVal >= 0) {
                    const [existFee] = await conn.execute(
                      `SELECT id FROM student_fee_items WHERE student_id = ? AND term_id = ? AND item = 'Imported Balance' LIMIT 1`,
                      [studentId, termId],
                    ) as any[];
                    if ((existFee as any[]).length > 0) {
                      await conn.execute(
                        'UPDATE student_fee_items SET amount = ? WHERE id = ?',
                        [feesVal, (existFee as any[])[0].id],
                      );
                    } else {
                      await conn.execute(
                        `INSERT INTO student_fee_items (student_id, term_id, item, amount, discount, paid) VALUES (?, ?, 'Imported Balance', ?, 0, 0)`,
                        [studentId, termId, feesVal],
                      );
                    }
                  }
                }

                await conn.commit();
                if (action === 'create')    stats.imported++;
                else if (action === 'update' || action === 'fees_only') stats.updated++;

                send({ type: 'progress', imported: stats.imported, updated: stats.updated, failed: stats.failed, skipped: stats.skipped, total: importRows.length, current_name: `${firstName} ${lastName}`, chunk: Math.floor(chunkStart / CHUNK_SIZE) + 1, session_id: sessionId });

              } catch (innerErr: any) {
                try { await conn.rollback(); } catch {}
                throw innerErr;
              }

            } catch (rowErr: any) {
              const msg = `Row ${rowNum}: ${rowErr.message || 'unknown error'}`;
              stats.errors.push(msg);
              stats.failed++;
              stats.failedRows.push(rowNum);
              await tryLogError(conn, sessionId, rowNum, rowErr.message || 'error', row);
              // non-fatal audit
              try {
                await conn.execute(
                  `INSERT INTO audit_logs (school_id, user_id, action, action_type, entity_type, details, source) VALUES (?, ?, 'IMPORT_ROW_ERROR', 'IMPORT_ROW_ERROR', 'students', ?, 'WEB')`,
                  [schoolId, userId, JSON.stringify({ row: rowNum, error: rowErr.message })],
                );
              } catch {}
              send({ type: 'progress', imported: stats.imported, updated: stats.updated, failed: stats.failed, skipped: stats.skipped, total: importRows.length, current_name: `Row ${rowNum} failed`, chunk: Math.floor(chunkStart / CHUNK_SIZE) + 1, session_id: sessionId });
            }
          } // end chunk rows

          // Update session progress after each chunk
          await tryUpdateSession(conn, sessionId, {
            processed_rows: stats.imported + stats.updated + stats.skipped + stats.failed,
            created_count:  stats.imported,
            updated_count:  stats.updated,
            skipped_count:  stats.skipped,
            failed_count:   stats.failed,
          });
          await new Promise(r => setTimeout(r, 5));
        } // end chunks

        // ── FINALISE SESSION ───────────────────────────────────────────────────
        await tryUpdateSession(conn, sessionId, {
          status:         'completed',
          processed_rows: importRows.length,
          created_count:  stats.imported,
          updated_count:  stats.updated,
          skipped_count:  stats.skipped,
          failed_count:   stats.failed,
        });

        // ── POST-IMPORT INTEGRITY CHECK ────────────────────────────────────────
        let integrityNote = '';
        try {
          const [unenrolled] = await conn.execute(
            `SELECT COUNT(*) AS cnt FROM students s
             WHERE s.school_id = ? AND s.deleted_at IS NULL
               AND NOT EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = s.id AND e.school_id = s.school_id)`,
            [schoolId],
          ) as any[];
          const unenrolledCount = (unenrolled as any[])[0]?.cnt ?? 0;
          if (unenrolledCount > 0) integrityNote = ` (${unenrolledCount} students across school still have no enrollment)`;
        } catch {}

        // Audit
        try {
          await conn.execute(
            `INSERT INTO audit_logs (school_id, user_id, action, action_type, entity_type, details, source)
             VALUES (?, ?, 'SMART_IMPORT_COMPLETE', 'BULK_IMPORT_STUDENTS', 'students', ?, 'WEB')`,
            [schoolId, userId, JSON.stringify({ imported: stats.imported, updated: stats.updated, skipped: stats.skipped, failed: stats.failed, total: importRows.length, session_id: sessionId })],
          );
          await conn.execute(
            `INSERT INTO notifications (school_id, actor_user_id, action, entity_type, title, message, priority, channel, created_at)
             VALUES (?, ?, 'BULK_IMPORT_STUDENTS', 'students', 'Bulk Import Complete', ?, 'normal', 'in_app', NOW())`,
            [schoolId, userId, `Created ${stats.imported}, updated ${stats.updated}, skipped ${stats.skipped}, failed ${stats.failed}${integrityNote}`],
          );
        } catch {}

        send({
          type:       'complete',
          imported:   stats.imported,
          updated:    stats.updated,
          skipped:    stats.skipped,
          failed:     stats.failed,
          errors:     stats.errors.slice(0, 100),
          failedRows: stats.failedRows,
          enrollmentsPreserved: stats.enrollmentsPreserved,
          total:      importRows.length,
          planLimitBlocked: capBlocked,
          // Surfaced separately from the generic "skipped" count. A skip for a
          // duplicate and a skip because the plan is full need different
          // actions from the operator, and lumping them together is how the
          // second one goes unnoticed until someone asks where a learner went.
          message:    `Import complete: ${stats.imported} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.failed} failed${stats.enrollmentsPreserved ? `, ${stats.enrollmentsPreserved} existing enrollment${stats.enrollmentsPreserved === 1 ? '' : 's'} preserved` : ''}${capBlocked ? `. ${capBlocked} learner${capBlocked === 1 ? ' was' : 's were'} NOT created because the plan limit of ${capState.limit} was reached — archive leavers or upgrade the plan` : ''}${integrityNote}`,
          session_id: sessionId,
        });

      } catch (err: any) {
        send({ type: 'error', message: err.message || 'Import failed unexpectedly' });
      } finally {
        if (conn) { try { await conn.end(); } catch {} }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':    'text/event-stream; charset=utf-8',
      'Cache-Control':   'no-cache, no-transform',
      'Connection':      'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

/**
 * PATCH /api/students/import — Bulk update fees for imported learners
 *
 * Allows correcting or setting fees in bulk after import. Useful when:
 * - Fees were 0 on import and need to be set
 * - Fees need adjustment before finalising
 * - Reopening import to fix fees
 *
 * Body: { updates: [{ student_id: number, fees: number }, ...], term_id?: number }
 * If term_id not provided, uses active term
 */
export async function PATCH(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  try {
    const body = await request.json();
    const { updates, term_id } = body;

    if (!Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ success: false, error: 'updates array required' }, { status: 400 });
    }

    let conn: any;
    try {
      conn = await getConnection();

      // Resolve term_id if not provided
      let termId = term_id;
      if (!termId) {
        const [terms] = await conn.execute(
          'SELECT id FROM terms WHERE school_id = ? ORDER BY is_active DESC, id DESC LIMIT 1',
          [schoolId],
        ) as any[];
        termId = (terms as any[])[0]?.id ?? null;
      }

      if (!termId) {
        return NextResponse.json({ success: false, error: 'No active term found' }, { status: 400 });
      }

      let updated = 0;
      let created = 0;
      const errors: string[] = [];

      for (const { student_id, fees } of updates) {
        if (!student_id || fees == null) continue;
        if (isNaN(parseFloat(fees))) {
          errors.push(`Student ${student_id}: invalid fee amount`);
          continue;
        }

        const feesVal = parseFloat(fees);

        try {
          // Check if fee item exists
          const [existFee] = await conn.execute(
            `SELECT id FROM student_fee_items WHERE student_id = ? AND term_id = ? AND item = 'Imported Balance' LIMIT 1`,
            [student_id, termId],
          ) as any[];

          if ((existFee as any[]).length > 0) {
            await conn.execute(
              'UPDATE student_fee_items SET amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [feesVal, (existFee as any[])[0].id],
            );
            updated++;
          } else {
            await conn.execute(
              `INSERT INTO student_fee_items (school_id, student_id, term_id, item, amount, discount, paid)
               VALUES (?, ?, ?, 'Imported Balance', ?, 0, 0)`,
              [schoolId, student_id, termId, feesVal],
            );
            created++;
          }
        } catch (err: any) {
          errors.push(`Student ${student_id}: ${err.message || 'unknown error'}`);
        }
      }

      return NextResponse.json({
        success: true,
        message: `Updated ${updated} fees, created ${created} new fee items`,
        updated,
        created,
        errors: errors.length > 0 ? errors : undefined,
      });
    } finally {
      if (conn) { try { await conn.end(); } catch {} }
    }
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message || 'Failed to update fees' }, { status: 500 });
  }
}
