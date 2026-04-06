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
 * Import options (formData booleans, all default true except feesOnly):
 *   updateExisting  — update fields on matched students
 *   createNew       — create students that had no match
 *   feesOnly        — ONLY update fees_balance, skip all student creation/update
 *   enrollNew       — auto-enroll newly created students
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
  regNoIdx: number; classIdx: number; sectionIdx: number;
  genderIdx: number; dobIdx: number; phoneIdx: number;
  addressIdx: number; photoUrlIdx: number; biometricIdIdx: number;
  feesBalanceIdx: number;
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

  const find = (...terms: string[]) => {
    for (const t of terms) {
      const idx = h.findIndex(x => x === t || x.replace(/[_\s-]/g, '') === t.replace(/[_\s-]/g, ''));
      if (idx !== -1) return idx;
    }
    for (const t of terms) {
      const idx = h.findIndex(x => x.includes(t));
      if (idx !== -1) return idx;
    }
    return -1;
  };
  return {
    nameIdx:        find('name', 'fullname', 'student_name', 'studentname'),
    firstNameIdx:   find('first_name', 'firstname', 'first'),
    lastNameIdx:    find('last_name', 'lastname', 'last', 'surname'),
    regNoIdx:       find('reg_no', 'regno', 'admission_no', 'adm_no', 'registration'),
    classIdx:       find('class', 'class_name', 'grade'),
    sectionIdx:     find('section', 'stream', 'division'),
    genderIdx:      find('gender', 'sex'),
    dobIdx:         find('date_of_birth', 'dob', 'birth_date', 'birthday'),
    phoneIdx:       find('phone', 'phone_no', 'mobile', 'contact'),
    addressIdx:     find('address', 'home_address'),
    photoUrlIdx:    find('photo_url', 'photo', 'image_url'),
    biometricIdIdx: find('biometric_id', 'biometric', 'device_id'),
    feesBalanceIdx: find('fees_balance', 'feesbalance', 'balance', 'fee_balance', 'fees', 'amount_due', 'outstanding'),
  };
}

function getNames(row: any[], cm: ColMap): { firstName: string; lastName: string } {
  if (cm.nameIdx !== -1 && row[cm.nameIdx]) {
    const parts = String(row[cm.nameIdx]).trim().split(/\s+/);
    return { firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || parts[0] || '' };
  }
  return {
    firstName: String(row[cm.firstNameIdx] ?? '').trim(),
    lastName:  String(row[cm.lastNameIdx]  ?? '').trim(),
  };
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
  } catch { return null; } // table not yet migrated — still works
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
  } catch {}
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
  } catch {}
}

async function tryCheckCancelled(conn: any, sessionId: number | null): Promise<boolean> {
  if (!sessionId) return false;
  try {
    const [rows] = await conn.execute(
      `SELECT status FROM import_sessions WHERE id = ? LIMIT 1`,
      [sessionId],
    ) as any[];
    return (rows as any[])[0]?.status === 'cancelled';
  } catch { return false; }
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

  // Normalise headers: lowercase + trim + spaces→underscores
  const rawHeaders  = rows[0] || [];
  const headers     = rawHeaders.map(h => String(h || '').toLowerCase().trim().replace(/[\s\-]+/g, '_'));
  const dataRows    = rows.slice(1).filter(r => r.some(c => c !== '' && c != null));

  const overridesRaw = formData.get('columnMapping') as string | null;
  let overrides: Record<string, string> | undefined;
  if (overridesRaw) { try { overrides = JSON.parse(overridesRaw); } catch {} }

  const cm = mapColumns(headers, overrides);

  const warnings: string[] = [];
  if (cm.nameIdx === -1 && cm.firstNameIdx === -1) {
    return NextResponse.json({ success: false, error: `Missing name column. Found: ${headers.join(', ')}` }, { status: 400 });
  }
  if (cm.classIdx === -1)       warnings.push('No "class" column — students will be imported without class enrollment');
  if (cm.genderIdx === -1)      warnings.push('No "gender" column detected');
  if (cm.feesBalanceIdx === -1) warnings.push('No "fees_balance" column — fees will not be set');
  if (cm.regNoIdx === -1)       warnings.push('No "reg_no" column — matching will fall back to name+class; system will auto-generate admission numbers');

  // ── PREVIEW MODE ─────────────────────────────────────────────────────────────
  if (mode === 'preview') {
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

      // Load all students into engine
      const [allStudents] = await conn.execute(
        `SELECT s.id, s.person_id, s.admission_no, s.class_id,
                UPPER(TRIM(CONCAT_WS(' ', p.first_name, p.last_name))) AS norm_name
         FROM students s JOIN people p ON p.id = s.person_id
         WHERE s.school_id = ? AND s.deleted_at IS NULL`,
        [schoolId],
      ) as any[];
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
  const importOptions  = { updateExisting, createNew, feesOnly, enrollNew };

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
        errors: [] as string[], failedRows: [] as number[],
      };

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

        // Load matching engine
        const [allStudents] = await conn.execute(
          `SELECT s.id, s.person_id, s.admission_no, s.class_id,
                  UPPER(TRIM(CONCAT_WS(' ', p.first_name, p.last_name))) AS norm_name
           FROM students s JOIN people p ON p.id = s.person_id
           WHERE s.school_id = ? AND s.deleted_at IS NULL`,
          [schoolId],
        ) as any[];
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
              const { firstName, lastName } = getNames(row, cm);
              if (!firstName) {
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
                  await execTenant(conn,
                    `UPDATE people SET
                       first_name = ?, last_name = ?,
                       gender        = COALESCE(?, gender),
                       date_of_birth = COALESCE(?, date_of_birth),
                       phone         = COALESCE(?, phone),
                       address       = COALESCE(?, address),
                       photo_url     = COALESCE(?, photo_url),
                       updated_at    = CURRENT_TIMESTAMP
                     WHERE id = (SELECT person_id FROM students WHERE id = ? AND school_id = ?)`,
                    [
                      firstName, lastName,
                      safe(cm.genderIdx   !== -1 ? row[cm.genderIdx]   : null),
                      safe(cm.dobIdx      !== -1 ? row[cm.dobIdx]      : null),
                      safe(cm.phoneIdx    !== -1 ? row[cm.phoneIdx]    : null),
                      safe(cm.addressIdx  !== -1 ? row[cm.addressIdx]  : null),
                      safe(cm.photoUrlIdx !== -1 ? row[cm.photoUrlIdx] : null),
                      matched.id, schoolId,
                    ], schoolId,
                  );

                } else if (action === 'create') {
                  // CREATE — person → student → enrollment (rolled back together on failure)
                  const year       = new Date().getFullYear();
                  const seq        = stats.imported + stats.updated + stats.skipped + 1;
                  const finalAdmNo = regNo ?? `XHN/${String(seq).padStart(4, '0')}/${year}`;
                  const isExternal = regNo !== null;
                  const notes      = `Bulk imported ${new Date().toISOString()}`;

                  const pr = await execTenant(conn,
                    `INSERT INTO people (school_id, first_name, last_name, gender, date_of_birth, phone, address, photo_url)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                      schoolId, firstName, lastName,
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

                // ── UPDATE ENROLLMENT (existing student) ─────────────────────
                if ((action === 'update') && studentId && cm.classIdx !== -1 && row[cm.classIdx]) {
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
                    await execTenant(conn,
                      `UPDATE enrollments SET class_id = ?, stream_id = ?, updated_at = CURRENT_TIMESTAMP
                       WHERE student_id = ? AND school_id = ? AND status = 'active'`,
                      [resolvedClassId, streamId, studentId, schoolId], schoolId,
                    );
                  }
                }

                // ── FEES ─────────────────────────────────────────────────────
                if (studentId && cm.feesBalanceIdx !== -1 && row[cm.feesBalanceIdx] && termId) {
                  const feesVal = parseFloat(String(row[cm.feesBalanceIdx]).replace(/[,\s]/g, ''));
                  if (!isNaN(feesVal) && feesVal > 0) {
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
          total:      importRows.length,
          message:    `Import complete: ${stats.imported} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.failed} failed${integrityNote}`,
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
