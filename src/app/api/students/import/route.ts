/**
 * POST /api/students/import
 *
 * Two modes:
 *   mode=preview  → validate headers, return first 5 rows preview (no DB writes)
 *   mode=import   → Server-Sent Events stream with chunked progress
 *
 * Accepted headers (case-insensitive):
 *   name | (first_name + last_name), reg_no, class, section/stream,
 *   gender, date_of_birth, phone, address, photo_url, biometric_id
 *
 * SSE events:
 *   { type:'progress', imported, total, current_name }
 *   { type:'complete', imported, updated, skipped, errors[], total, message }
 *   { type:'error',    message }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import * as XLSX from 'xlsx';
import { getSessionSchoolId } from '@/lib/auth';

const CHUNK_SIZE = 50; // rows per micro-batch

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
}

function mapColumns(headers: string[]): ColMap {
  const h = headers.map(x => String(x || '').toLowerCase().trim());
  const find = (...terms: string[]) => {
    for (const t of terms) {
      const idx = h.findIndex(x => x === t || x.replace(/[_\s-]/g, '') === t.replace(/[_\s-]/g, ''));
      if (idx !== -1) return idx;
    }
    // partial match fallback
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
  // Auth
  let session: { schoolId: number } | null = null;
  try {
    session = await getSessionSchoolId(request);
  } catch { /* fall through */ }
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const mode = (formData.get('mode') as string | null) || 'import';

  if (!file) return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });

  // Parse file
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
  const cm = mapColumns(headers);

  const warnings: string[] = [];
  if (cm.nameIdx === -1 && cm.firstNameIdx === -1) {
    return NextResponse.json({ success: false, error: `Missing name column. Found: ${headers.join(', ')}` }, { status: 400 });
  }
  if (cm.classIdx === -1) warnings.push('No "class" column — students will be imported without class enrollment');
  if (cm.genderIdx === -1) warnings.push('No "gender" column detected');

  // ── PREVIEW MODE ──────────────────────────────────────────────────────────
  if (mode === 'preview') {
    const preview = dataRows.slice(0, 5).map((row, i) => {
      const { firstName, lastName } = getNames(row, cm);
      return {
        '#': i + 1,
        name: `${firstName} ${lastName}`.trim() || '(empty)',
        reg_no: cm.regNoIdx !== -1 ? (row[cm.regNoIdx] || '—') : '—',
        class:  cm.classIdx  !== -1 ? (row[cm.classIdx]  || '—') : '—',
        gender: cm.genderIdx !== -1 ? (row[cm.genderIdx] || '—') : '—',
      };
    });
    return NextResponse.json({ success: true, total: dataRows.length, preview, warnings, readyToImport: true });
  }

  // ── IMPORT MODE — Server-Sent Events stream ───────────────────────────────
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: object) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)); } catch { /* closed */ }
      };

      let conn: any;
      const stats = { imported: 0, updated: 0, skipped: 0, errors: [] as string[] };

      try {
        conn = await getConnection();

        // Load lookup tables once
        const [rawClasses] = await conn.execute('SELECT id, name FROM classes WHERE school_id = ?', [schoolId]) as any[];
        const [rawStreams] = await conn.execute('SELECT id, name FROM streams') as any[];
        const [rawYears]   = await conn.execute('SELECT id FROM academic_years WHERE status = "active" LIMIT 1') as any[];
        const [rawTerms]   = await conn.execute('SELECT id FROM terms WHERE is_active = 1 AND school_id = ? LIMIT 1', [schoolId]) as any[];

        const classMap  = new Map((rawClasses  as any[]).map(c => [c.name.toLowerCase(), c.id]));
        const streamMap = new Map((rawStreams as any[]).map(s => [s.name.toLowerCase(), s.id]));
        const yearId    = (rawYears  as any[])[0]?.id ?? null;
        const termId    = (rawTerms  as any[])[0]?.id ?? null;

        for (let chunkStart = 0; chunkStart < dataRows.length; chunkStart += CHUNK_SIZE) {
          const chunk = dataRows.slice(chunkStart, chunkStart + CHUNK_SIZE);

          for (let i = 0; i < chunk.length; i++) {
            const rowNum = chunkStart + i + 2;
            const row = chunk[i];

            try {
              const { firstName, lastName } = getNames(row, cm);
              if (!firstName) {
                stats.errors.push(`Row ${rowNum}: missing name`);
                stats.skipped++;
                send({ type: 'progress', imported: stats.imported + stats.updated, total: dataRows.length, current_name: `Row ${rowNum} skipped` });
                continue;
              }

              const regNo = cm.regNoIdx !== -1 ? safe(row[cm.regNoIdx]) : null;

              await conn.beginTransaction();
              try {
                let studentId: number | null = null;
                let isUpdate = false;

                // Check existing by reg_no/admission_no
                if (regNo) {
                  const [existing] = await conn.execute(
                    'SELECT id FROM students WHERE admission_no = ? AND school_id = ? LIMIT 1',
                    [regNo, schoolId],
                  ) as any[];
                  if ((existing as any[]).length > 0) {
                    studentId = (existing as any[])[0].id;
                    isUpdate = true;
                    await conn.execute(
                      `UPDATE people SET first_name=?, last_name=?,
                         gender=COALESCE(?,gender), date_of_birth=COALESCE(?,date_of_birth),
                         phone=COALESCE(?,phone), address=COALESCE(?,address),
                         photo_url=COALESCE(?,photo_url), updated_at=CURRENT_TIMESTAMP
                       WHERE id=(SELECT person_id FROM students WHERE id=?)`,
                      [
                        firstName, lastName,
                        safe(cm.genderIdx  !== -1 ? row[cm.genderIdx]  : null),
                        safe(cm.dobIdx     !== -1 ? row[cm.dobIdx]     : null),
                        safe(cm.phoneIdx   !== -1 ? row[cm.phoneIdx]   : null),
                        safe(cm.addressIdx !== -1 ? row[cm.addressIdx] : null),
                        safe(cm.photoUrlIdx !== -1 ? row[cm.photoUrlIdx] : null),
                        studentId,
                      ],
                    );
                  }
                }

                if (!isUpdate) {
                  // Generate seq admission number
                  const year = new Date().getFullYear();
                  const finalAdmNo = regNo ?? (() => {
                    const seq = stats.imported + stats.updated + stats.skipped + 1;
                    return `XHN/${String(seq).padStart(4, '0')}/${year}`;
                  })();

                  const notesExtra = cm.biometricIdIdx !== -1 && row[cm.biometricIdIdx]
                    ? `; biometric_id=${row[cm.biometricIdIdx]}` : '';

                  const [pr] = await conn.execute(
                    `INSERT INTO people (school_id, first_name, last_name, gender, date_of_birth, phone, address, photo_url)
                     VALUES (?,?,?,?,?,?,?,?)`,
                    [
                      schoolId, firstName, lastName,
                      safe(cm.genderIdx  !== -1 ? row[cm.genderIdx]  : null),
                      safe(cm.dobIdx     !== -1 ? row[cm.dobIdx]     : null),
                      safe(cm.phoneIdx   !== -1 ? row[cm.phoneIdx]   : null),
                      safe(cm.addressIdx !== -1 ? row[cm.addressIdx] : null),
                      safe(cm.photoUrlIdx !== -1 ? row[cm.photoUrlIdx] : null),
                    ],
                  ) as any[];
                  const personId = (pr as any).insertId;

                  const [sr] = await conn.execute(
                    `INSERT INTO students (school_id, person_id, admission_no, status, notes)
                     VALUES (?,?,?,'active',?)`,
                    [schoolId, personId, finalAdmNo, `Bulk imported ${new Date().toISOString()}${notesExtra}`],
                  ) as any[];
                  studentId = (sr as any).insertId;
                }

                // Enroll
                if (studentId && cm.classIdx !== -1 && row[cm.classIdx]) {
                  const classId = classMap.get(String(row[cm.classIdx]).trim().toLowerCase());
                  if (classId) {
                    const streamId = cm.sectionIdx !== -1 && row[cm.sectionIdx]
                      ? (streamMap.get(String(row[cm.sectionIdx]).trim().toLowerCase()) ?? null)
                      : null;
                    if (isUpdate) {
                      await conn.execute(
                        `UPDATE enrollments SET class_id=?, stream_id=?, updated_at=CURRENT_TIMESTAMP
                         WHERE student_id=? AND status='active'`,
                        [classId, streamId, studentId],
                      );
                    } else {
                      await conn.execute(
                        `INSERT INTO enrollments (school_id, student_id, class_id, stream_id, academic_year_id, term_id, status)
                         VALUES (?,?,?,?,?,?,'active')
                         ON DUPLICATE KEY UPDATE class_id=VALUES(class_id), stream_id=VALUES(stream_id)`,
                        [schoolId, studentId, classId, streamId, yearId, termId],
                      );
                    }
                  }
                }

                await conn.commit();
                isUpdate ? stats.updated++ : stats.imported++;
                send({ type: 'progress', imported: stats.imported + stats.updated, total: dataRows.length, current_name: `${firstName} ${lastName}` });
              } catch (innerErr: any) {
                await conn.rollback();
                throw innerErr;
              }
            } catch (rowErr: any) {
              stats.errors.push(`Row ${rowNum}: ${rowErr.message || 'error'}`);
              stats.skipped++;
              send({ type: 'progress', imported: stats.imported + stats.updated, total: dataRows.length, current_name: `Row ${rowNum} error` });
            }
          }
          // yield between chunks
          await new Promise(r => setTimeout(r, 5));
        }

        // Audit + Notification (non-critical)
        try {
          await conn.execute(
            `INSERT INTO audit_logs (school_id, action, entity_type, metadata, source)
             VALUES (?, 'BULK_IMPORT_STUDENTS', 'students', ?, 'WEB')`,
            [schoolId, JSON.stringify({ imported: stats.imported, updated: stats.updated, skipped: stats.skipped, total: dataRows.length })],
          );
          await conn.execute(
            `INSERT INTO notifications (school_id, action, entity_type, title, message, priority, channel, created_at)
             VALUES (?, 'BULK_IMPORT_STUDENTS', 'students', 'Bulk Import Complete',
               ?, 'normal', 'in_app', NOW())`,
            [schoolId, `Imported ${stats.imported} new, updated ${stats.updated}, skipped ${stats.skipped} students`],
          );
        } catch { /* Non-critical */ }

        send({
          type: 'complete',
          imported: stats.imported,
          updated: stats.updated,
          skipped: stats.skipped,
          errors: stats.errors.slice(0, 30),
          total: dataRows.length,
          message: `Import complete: ${stats.imported} added, ${stats.updated} updated, ${stats.skipped} skipped`,
        });
      } catch (err: any) {
        send({ type: 'error', message: err.message || 'Import failed unexpectedly' });
      } finally {
        if (conn) { try { await conn.end(); } catch { /* ignore */ } }
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
