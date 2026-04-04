/**
 * POST /api/students/import
 *
 * Three modes:
 *   mode=preview   → parse headers, return first 10 rows preview + column mapping + warnings
 *   mode=validate  → validate ALL rows against DB (duplicate reg_no, missing name/class, bad fees) — no writes
 *   mode=import    → SSE stream: admit + enroll + set fees_balance with per-row transaction
 *
 * Also supports:
 *   mode=create-class  → quick-create a missing class inline
 *   mode=create-stream → quick-create a missing stream inline
 *   mode=retry         → re-import specific failed row indices
 *
 * Accepted headers (case-insensitive):
 *   name | (first_name + last_name), reg_no, class, section/stream,
 *   gender, date_of_birth, phone, address, photo_url, biometric_id, fees_balance
 *
 * SSE events:
 *   { type:'progress', imported, updated, total, current_name, chunk }
 *   { type:'complete', imported, updated, skipped, failed, errors[], failedRows[], total, message }
 *   { type:'error',    message }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { execTenant } from '@/lib/dbTenant';
import * as XLSX from 'xlsx';
import { getSessionSchoolId } from '@/lib/auth';

const CHUNK_SIZE = 50;

function safe(v: any): string | null {
  return (v === undefined || v === '' || v === null) ? null : String(v).trim() || null;
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
        if (inQuotes && nextChar === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  
  return rows;
}

// ─── Column mapper ────────────────────────────────────────────────────────────

interface ColMap {
  nameIdx: number; firstNameIdx: number; lastNameIdx: number;
  regNoIdx: number; classIdx: number; sectionIdx: number;
  genderIdx: number; dobIdx: number; phoneIdx: number;
  addressIdx: number; photoUrlIdx: number; biometricIdIdx: number;
  feesBalanceIdx: number;
}

function mapColumns(headers: string[], overrides?: Record<string, string>): ColMap {
  const h = headers.map(x => String(x || '').toLowerCase().trim());

  // If UI sent column mapping overrides, apply them
  if (overrides && Object.keys(overrides).length > 0) {
    const findOverride = (key: string) => {
      const mapped = overrides[key];
      if (!mapped) return -1;
      const idx = h.indexOf(mapped.toLowerCase().trim());
      return idx;
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

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;
  const userId = session.userId;

  const formData = await request.formData();
  const mode = (formData.get('mode') as string | null) || 'import';

  // ── QUICK-CREATE CLASS ──────────────────────────────────────────────────
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

  // ── QUICK-CREATE STREAM ─────────────────────────────────────────────────
  if (mode === 'create-stream') {
    const name = (formData.get('name') as string || '').trim();
    const classId = parseInt(formData.get('class_id') as string || '0', 10);
    if (!name || !classId) return NextResponse.json({ success: false, error: 'Stream name and class_id required' }, { status: 400 });
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

  // ── FILE PARSING (shared by preview, validate, import) ──────────────────
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });

  let rows: string[][] = [];
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    if (file.name.endsWith('.csv') || file.type === 'text/csv') {
      rows = parseCSV(buffer.toString('utf-8'));
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type.includes('spreadsheetml') || file.type.includes('ms-excel')) {
      const wb = XLSX.read(buffer, { type: 'buffer' });
      rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }) as string[][];
    } else {
      return NextResponse.json({ success: false, error: 'Unsupported format. Use .csv or .xlsx' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ success: false, error: 'Failed to parse file. Check format.' }, { status: 400 });
  }

  if (rows.length < 2) return NextResponse.json({ success: false, error: 'File has no data rows' }, { status: 400 });

  const headers = (rows[0] || []).map(h => String(h || '').toLowerCase().trim());
  const dataRows = rows.slice(1).filter(r => r.some(c => c !== '' && c != null));

  // Parse column mapping overrides from UI
  const overridesRaw = formData.get('columnMapping') as string | null;
  let overrides: Record<string, string> | undefined;
  if (overridesRaw) {
    try { overrides = JSON.parse(overridesRaw); } catch {}
  }

  const cm = mapColumns(headers, overrides);

  const warnings: string[] = [];
  if (cm.nameIdx === -1 && cm.firstNameIdx === -1) {
    return NextResponse.json({ success: false, error: `Missing name column. Found: ${headers.join(', ')}` }, { status: 400 });
  }
  if (cm.classIdx === -1) warnings.push('No "class" column — students will be imported without class enrollment');
  if (cm.genderIdx === -1) warnings.push('No "gender" column detected');
  if (cm.feesBalanceIdx === -1) warnings.push('No "fees_balance" column — fees will not be set');
  if (cm.regNoIdx === -1) warnings.push('No "reg_no" column — system will auto-generate admission numbers');

  // ── PREVIEW MODE ──────────────────────────────────────────────────────────
  if (mode === 'preview') {
    const preview = dataRows.slice(0, 10).map((row, i) => {
      const { firstName, lastName } = getNames(row, cm);
      const obj: Record<string, string> = {
        '#': String(i + 1),
        name: `${firstName} ${lastName}`.trim() || '(empty)',
        reg_no: cm.regNoIdx !== -1 ? (row[cm.regNoIdx] || '—') : '—',
        class: cm.classIdx !== -1 ? (row[cm.classIdx] || '—') : '—',
        section: cm.sectionIdx !== -1 ? (row[cm.sectionIdx] || '—') : '—',
        gender: cm.genderIdx !== -1 ? (row[cm.genderIdx] || '—') : '—',
      };
      if (cm.feesBalanceIdx !== -1) {
        obj.fees_balance = row[cm.feesBalanceIdx] || '—';
      }
      return obj;
    });

    const columnMapping: Record<string, string | null> = {};
    const systemFields = [
      { key: 'name',          mapped: cm.nameIdx >= 0        ? headers[cm.nameIdx]        : null },
      { key: 'first_name',    mapped: cm.firstNameIdx >= 0   ? headers[cm.firstNameIdx]   : null },
      { key: 'last_name',     mapped: cm.lastNameIdx >= 0    ? headers[cm.lastNameIdx]    : null },
      { key: 'reg_no',        mapped: cm.regNoIdx >= 0       ? headers[cm.regNoIdx]       : null },
      { key: 'class',         mapped: cm.classIdx >= 0       ? headers[cm.classIdx]       : null },
      { key: 'section',       mapped: cm.sectionIdx >= 0     ? headers[cm.sectionIdx]     : null },
      { key: 'gender',        mapped: cm.genderIdx >= 0      ? headers[cm.genderIdx]      : null },
      { key: 'date_of_birth', mapped: cm.dobIdx >= 0         ? headers[cm.dobIdx]         : null },
      { key: 'phone',         mapped: cm.phoneIdx >= 0       ? headers[cm.phoneIdx]       : null },
      { key: 'address',       mapped: cm.addressIdx >= 0     ? headers[cm.addressIdx]     : null },
      { key: 'photo_url',     mapped: cm.photoUrlIdx >= 0    ? headers[cm.photoUrlIdx]    : null },
      { key: 'biometric_id',  mapped: cm.biometricIdIdx >= 0 ? headers[cm.biometricIdIdx] : null },
      { key: 'fees_balance',  mapped: cm.feesBalanceIdx >= 0 ? headers[cm.feesBalanceIdx] : null },
    ];
    for (const f of systemFields) columnMapping[f.key] = f.mapped;

    // Detect column types
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
      success: true,
      total: dataRows.length,
      preview,
      warnings,
      readyToImport: true,
      fileHeaders: headers,
      columnMapping,
      columnTypes,
    });
  }

  // ── VALIDATE MODE ─────────────────────────────────────────────────────────
  if (mode === 'validate') {
    let conn: any;
    try {
      conn = await getConnection();

      const [rawClasses] = await conn.execute('SELECT id, LOWER(name) as name FROM classes WHERE school_id = ?', [schoolId]) as any[];
      const [rawStreams] = await conn.execute('SELECT id, LOWER(name) as name, class_id FROM streams WHERE school_id = ?', [schoolId]) as any[];
      const classMap = new Map((rawClasses as any[]).map((c: any) => [c.name, c.id]));
      const streamMap = new Map((rawStreams as any[]).map((s: any) => [`${s.class_id}:${s.name}`, s.id]));
      const classNames = new Set((rawClasses as any[]).map((c: any) => c.name));
      const streamNames = new Map<number, Set<string>>();
      for (const s of rawStreams as any[]) {
        if (!streamNames.has(s.class_id)) streamNames.set(s.class_id, new Set());
        streamNames.get(s.class_id)!.add(s.name);
      }

      // Load existing admission_no set
      const [existingStudents] = await conn.execute(
        'SELECT admission_no FROM students WHERE school_id = ? AND admission_no IS NOT NULL',
        [schoolId],
      ) as any[];
      const existingAdmNos = new Set((existingStudents as any[]).map((s: any) => String(s.admission_no).trim().toLowerCase()));

      const errors: { row: number; field: string; value: string; message: string }[] = [];
      const rowFlags: ('valid' | 'warning' | 'error')[] = [];
      const seenRegNos = new Map<string, number>(); // track duplicates within file
      const missingClasses = new Set<string>();
      const missingStreams = new Set<string>();
      let validCount = 0;
      let duplicateInSystem = 0;

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        const rowNum = i + 2;
        let hasError = false;
        let hasWarning = false;

        const { firstName, lastName } = getNames(row, cm);
        const fullName = `${firstName} ${lastName}`.trim();

        // Required: name
        if (!firstName && !lastName) {
          errors.push({ row: rowNum, field: 'name', value: '', message: 'Name is required' });
          hasError = true;
        }

        // reg_no: check duplicates in file and system
        if (cm.regNoIdx !== -1) {
          const regNo = safe(row[cm.regNoIdx]);
          if (regNo) {
            const regNoLower = regNo.toLowerCase();
            if (seenRegNos.has(regNoLower)) {
              errors.push({ row: rowNum, field: 'reg_no', value: regNo, message: `Duplicate reg_no in file (same as row ${seenRegNos.get(regNoLower)})` });
              hasError = true;
            } else {
              seenRegNos.set(regNoLower, rowNum);
            }
            if (existingAdmNos.has(regNoLower)) {
              errors.push({ row: rowNum, field: 'reg_no', value: regNo, message: 'Already exists in system — will UPDATE' });
              hasWarning = true;
              duplicateInSystem++;
            }
          }
        }

        // class: check exists
        if (cm.classIdx !== -1) {
          const className = safe(row[cm.classIdx]);
          if (className) {
            if (!classNames.has(className.toLowerCase())) {
              errors.push({ row: rowNum, field: 'class', value: className, message: `Class "${className}" does not exist` });
              hasWarning = true;
              missingClasses.add(className);
            } else {
              // section: check exists under that class
              if (cm.sectionIdx !== -1) {
                const sectionName = safe(row[cm.sectionIdx]);
                if (sectionName) {
                  const classId = classMap.get(className.toLowerCase());
                  if (classId) {
                    const classStreams = streamNames.get(classId);
                    if (!classStreams || !classStreams.has(sectionName.toLowerCase())) {
                      errors.push({ row: rowNum, field: 'section', value: sectionName, message: `Section "${sectionName}" does not exist under "${className}"` });
                      hasWarning = true;
                      missingStreams.add(`${className}:${sectionName}`);
                    }
                  }
                }
              }
            }
          } else {
            errors.push({ row: rowNum, field: 'class', value: '', message: 'Class is empty — student will have no enrollment' });
            hasWarning = true;
          }
        }

        // fees_balance: validate numeric
        if (cm.feesBalanceIdx !== -1) {
          const feesVal = safe(row[cm.feesBalanceIdx]);
          if (feesVal) {
            const parsed = parseFloat(feesVal.replace(/[,\s]/g, ''));
            if (isNaN(parsed)) {
              errors.push({ row: rowNum, field: 'fees_balance', value: feesVal, message: 'Non-numeric fees_balance' });
              hasError = true;
            } else if (parsed < 0) {
              errors.push({ row: rowNum, field: 'fees_balance', value: feesVal, message: 'Negative fees_balance' });
              hasWarning = true;
            }
          }
        }

        if (hasError) rowFlags.push('error');
        else if (hasWarning) rowFlags.push('warning');
        else { rowFlags.push('valid'); validCount++; }
      }

      return NextResponse.json({
        success: true,
        total: dataRows.length,
        valid: validCount,
        duplicateInSystem,
        errors,
        rowFlags,
        missingClasses: Array.from(missingClasses),
        missingStreams: Array.from(missingStreams).map(s => {
          const [cls, stream] = s.split(':');
          return { class: cls, stream };
        }),
        canProceed: errors.filter(e => e.message !== 'Already exists in system — will UPDATE' && !e.message.includes('does not exist') && !e.message.includes('is empty')).every(e =>
          e.message.includes('will UPDATE') || e.message.includes('Negative')
        ) || errors.length === 0,
      });
    } catch (err: any) {
      return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    } finally {
      if (conn) { try { await conn.end(); } catch {} }
    }
  }

  // ── IMPORT MODE — SSE stream ──────────────────────────────────────────────
  // Support retry mode: only import specific row indices
  const retryIndicesRaw = formData.get('retryIndices') as string | null;
  let retryIndices: Set<number> | null = null;
  if (retryIndicesRaw) {
    try {
      const arr = JSON.parse(retryIndicesRaw) as number[];
      retryIndices = new Set(arr);
    } catch {}
  }

  const importRows = retryIndices
    ? dataRows.filter((_, i) => retryIndices!.has(i + 2)) // row numbers are 1-indexed + header
    : dataRows;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch {}
      };

      let conn: any;
      const stats = { imported: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[], failedRows: [] as number[] };

      try {
        conn = await getConnection();

        const [rawClasses] = await conn.execute('SELECT id, LOWER(name) as name FROM classes WHERE school_id = ?', [schoolId]) as any[];
        const [rawStreams] = await conn.execute('SELECT id, LOWER(name) as name, class_id FROM streams WHERE school_id = ?', [schoolId]) as any[];
        const [rawYears] = await conn.execute('SELECT id FROM academic_years WHERE status = "active" AND school_id = ? LIMIT 1', [schoolId]) as any[];
        const [rawTerms] = await conn.execute('SELECT id FROM terms WHERE is_active = 1 AND school_id = ? LIMIT 1', [schoolId]) as any[];

        const classMap = new Map((rawClasses as any[]).map((c: any) => [c.name, c.id]));
        const streamsByClass = new Map<number, Map<string, number>>();
        for (const s of rawStreams as any[]) {
          if (!streamsByClass.has(s.class_id)) streamsByClass.set(s.class_id, new Map());
          streamsByClass.get(s.class_id)!.set(s.name, s.id);
        }
        const yearId = (rawYears as any[])[0]?.id ?? null;
        const termId = (rawTerms as any[])[0]?.id ?? null;

        for (let chunkStart = 0; chunkStart < importRows.length; chunkStart += CHUNK_SIZE) {
          const chunk = importRows.slice(chunkStart, chunkStart + CHUNK_SIZE);

          for (let i = 0; i < chunk.length; i++) {
            const globalIdx = retryIndices
              ? Array.from(retryIndices)[chunkStart + i]
              : chunkStart + i + 2;
            const rowNum = globalIdx;
            const row = chunk[i];

            try {
              const { firstName, lastName } = getNames(row, cm);
              if (!firstName) {
                stats.errors.push(`Row ${rowNum}: missing name`);
                stats.skipped++;
                stats.failedRows.push(rowNum);
                send({ type: 'progress', imported: stats.imported + stats.updated, total: importRows.length, current_name: `Row ${rowNum} skipped` });
                continue;
              }

              const regNo = cm.regNoIdx !== -1 ? safe(row[cm.regNoIdx]) : null;

              await conn.beginTransaction();
              try {
                let studentId: number | null = null;
                let isUpdate = false;

                if (regNo) {
                  const [existing] = await conn.execute(
                    'SELECT id FROM students WHERE admission_no = ? AND school_id = ? LIMIT 1',
                    [regNo, schoolId],
                  ) as any[];
                  if ((existing as any[]).length > 0) {
                    studentId = (existing as any[])[0].id;
                    isUpdate = true;
                    await execTenant(conn,
                      `UPDATE people SET first_name=?, last_name=?,
                         gender=COALESCE(?,gender), date_of_birth=COALESCE(?,date_of_birth),
                         phone=COALESCE(?,phone), address=COALESCE(?,address),
                         photo_url=COALESCE(?,photo_url), updated_at=CURRENT_TIMESTAMP
                       WHERE id=(SELECT person_id FROM students WHERE id=? AND school_id=?)`,
                      [
                        firstName, lastName,
                        safe(cm.genderIdx !== -1 ? row[cm.genderIdx] : null),
                        safe(cm.dobIdx !== -1 ? row[cm.dobIdx] : null),
                        safe(cm.phoneIdx !== -1 ? row[cm.phoneIdx] : null),
                        safe(cm.addressIdx !== -1 ? row[cm.addressIdx] : null),
                        safe(cm.photoUrlIdx !== -1 ? row[cm.photoUrlIdx] : null),
                        studentId, schoolId,
                      ], schoolId,
                    );
                  }
                }

                if (!isUpdate) {
                  const year = new Date().getFullYear();
                  const finalAdmNo = regNo ?? (() => {
                    const seq = stats.imported + stats.updated + stats.skipped + 1;
                    return `XHN/${String(seq).padStart(4, '0')}/${year}`;
                  })();

                  const notesExtra = cm.biometricIdIdx !== -1 && row[cm.biometricIdIdx]
                    ? `; biometric_id=${row[cm.biometricIdIdx]}` : '';

                  const pr = await execTenant(conn,
                    `INSERT INTO people (school_id, first_name, last_name, gender, date_of_birth, phone, address, photo_url)
                     VALUES (?,?,?,?,?,?,?,?)`,
                    [
                      schoolId, firstName, lastName,
                      safe(cm.genderIdx !== -1 ? row[cm.genderIdx] : null),
                      safe(cm.dobIdx !== -1 ? row[cm.dobIdx] : null),
                      safe(cm.phoneIdx !== -1 ? row[cm.phoneIdx] : null),
                      safe(cm.addressIdx !== -1 ? row[cm.addressIdx] : null),
                      safe(cm.photoUrlIdx !== -1 ? row[cm.photoUrlIdx] : null),
                    ], schoolId,
                  );
                  const personId = pr.insertId;

                  const sr = await execTenant(conn,
                    `INSERT INTO students (school_id, person_id, admission_no, status, notes)
                     VALUES (?,?,?,'active',?)`,
                    [schoolId, personId, finalAdmNo, `Bulk imported ${new Date().toISOString()}${notesExtra}`],
                    schoolId,
                  );
                  studentId = sr.insertId;
                }

                // Enroll
                if (studentId && cm.classIdx !== -1 && row[cm.classIdx]) {
                  const classId = classMap.get(String(row[cm.classIdx]).trim().toLowerCase());
                  if (classId) {
                    const streamId = cm.sectionIdx !== -1 && row[cm.sectionIdx]
                      ? (streamsByClass.get(classId)?.get(String(row[cm.sectionIdx]).trim().toLowerCase()) ?? null)
                      : null;
                    if (isUpdate) {
                      await execTenant(conn,
                        `UPDATE enrollments SET class_id=?, stream_id=?, updated_at=CURRENT_TIMESTAMP
                         WHERE student_id=? AND school_id=? AND status='active'`,
                        [classId, streamId, studentId, schoolId], schoolId,
                      );
                    } else {
                      await execTenant(conn,
                        `INSERT INTO enrollments (school_id, student_id, class_id, stream_id, academic_year_id, term_id, status)
                         VALUES (?,?,?,?,?,?,'active')
                         ON DUPLICATE KEY UPDATE class_id=VALUES(class_id), stream_id=VALUES(stream_id)`,
                        [schoolId, studentId, classId, streamId, yearId, termId], schoolId,
                      );
                    }
                  }
                }

                // Fees balance
                if (studentId && cm.feesBalanceIdx !== -1 && row[cm.feesBalanceIdx] && termId) {
                  const feesVal = parseFloat(String(row[cm.feesBalanceIdx]).replace(/[,\s]/g, ''));
                  if (!isNaN(feesVal) && feesVal > 0) {
                    // Check if already has an "Imported Balance" item for this term
                    // student_fee_items has no school_id column — filter by student_id + term_id only
                    const [existingFee] = await conn.execute(
                      `SELECT id FROM student_fee_items WHERE student_id = ? AND term_id = ? AND item = 'Imported Balance' LIMIT 1`,
                      [studentId, termId],
                    ) as any[];
                    if ((existingFee as any[]).length > 0) {
                      await conn.execute(
                        `UPDATE student_fee_items SET amount = ? WHERE id = ?`,
                        [feesVal, (existingFee as any[])[0].id],
                      );
                    } else {
                      await conn.execute(
                        `INSERT INTO student_fee_items (student_id, term_id, item, amount, discount, paid)
                         VALUES (?, ?, 'Imported Balance', ?, 0, 0)`,
                        [studentId, termId, feesVal],
                      );
                    }
                  }
                }

                await conn.commit();
                if (isUpdate) { stats.updated++; } else { stats.imported++; }
                send({
                  type: 'progress',
                  imported: stats.imported,
                  updated: stats.updated,
                  failed: stats.failed,
                  total: importRows.length,
                  current_name: `${firstName} ${lastName}`,
                  chunk: Math.floor(chunkStart / CHUNK_SIZE) + 1,
                });
              } catch (innerErr: any) {
                try { await conn.rollback(); } catch {}
                throw innerErr;
              }
            } catch (rowErr: any) {
              const errMsg = `Row ${rowNum}: ${rowErr.message || 'error'}`;
              stats.errors.push(errMsg);
              stats.failed++;
              stats.failedRows.push(rowNum);

              // Log error to DB (non-critical)
              try {
                await conn.execute(
                  `INSERT INTO audit_logs (school_id, user_id, action, action_type, entity_type, details, source)
                   VALUES (?, ?, 'IMPORT_ROW_ERROR', 'IMPORT_ROW_ERROR', 'students', ?, 'WEB')`,
                  [schoolId, userId, JSON.stringify({ row: rowNum, error: rowErr.message || 'error' })],
                );
              } catch {}

              send({
                type: 'progress',
                imported: stats.imported,
                updated: stats.updated,
                failed: stats.failed,
                total: importRows.length,
                current_name: `Row ${rowNum} failed`,
                chunk: Math.floor(chunkStart / CHUNK_SIZE) + 1,
              });
            }
          }
          await new Promise(r => setTimeout(r, 5));
        }

        // Audit + Notification
        try {
          await conn.execute(
            `INSERT INTO audit_logs (school_id, user_id, action, action_type, entity_type, details, source)
             VALUES (?, ?, 'BULK_IMPORT_STUDENTS', 'BULK_IMPORT_STUDENTS', 'students', ?, 'WEB')`,
            [schoolId, userId, JSON.stringify({ imported: stats.imported, updated: stats.updated, skipped: stats.skipped, failed: stats.failed, total: importRows.length })],
          );
          await conn.execute(
            `INSERT INTO notifications (school_id, actor_user_id, action, entity_type, title, message, priority, channel, created_at)
             VALUES (?, ?, 'BULK_IMPORT_STUDENTS', 'students', 'Bulk Import Complete',
               ?, 'normal', 'in_app', NOW())`,
            [schoolId, userId, `Imported ${stats.imported} new, updated ${stats.updated}, failed ${stats.failed} students`],
          );
        } catch {}

        send({
          type: 'complete',
          imported: stats.imported,
          updated: stats.updated,
          skipped: stats.skipped,
          failed: stats.failed,
          errors: stats.errors.slice(0, 50),
          failedRows: stats.failedRows,
          total: importRows.length,
          message: `Import complete: ${stats.imported} admitted, ${stats.updated} updated, ${stats.failed} failed`,
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
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
