import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { isSubjectAllocatedToClass } from '@/lib/subject-allocation-validation';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { checkModule } from '@/lib/auth/requireModule';

interface ImportRow {
  student_id?: number;
  admission_no?: string;
  first_name?: string;
  last_name?: string;
  [subjectName: string]: any;
}

interface ValidationError {
  row: number;
  column?: string;
  message: string;
  student_id?: number;
}

interface ImportResult {
  success: boolean;
  imported: number;
  /**
   * Rows that already existed for the same (student, subject, term,
   * result_type) tuple and were rewritten in place. Surfaced separately
   * from `imported` so the UI can tell the user "we refactored N
   * existing marks" — see ResultsImportSystem.tsx success page.
   */
  updated: number;
  skipped: number;
  errors: ValidationError[];
  warnings: string[];
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const academic_year_id = formData.get('academic_year_id') as string;
    const term_id = formData.get('term_id') as string;
    const class_id = formData.get('class_id') as string;
    const result_type_id = formData.get('result_type_id') as string;
    const mappings = JSON.parse(formData.get('mappings') as string || '{}');
    // When '1', existing (student, subject, term, result_type) tuples are
    // UPDATEd in place rather than silently skipped. The UI toggle lives
    // in ResultsImportSystem.tsx; default to off (legacy behaviour) so
    // callers that don't pass the flag still get the old semantics.
    const updateExisting = String(formData.get('update_existing') || '0') === '1';

    if (!file || !academic_year_id || !term_id || !class_id || !result_type_id) {
      return NextResponse.json({
        error: 'Missing required parameters: file, academic_year_id, term_id, class_id, result_type_id'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Verify class belongs to this school
    const [classCheck]: any = await connection.execute(
      'SELECT id FROM classes WHERE id = ? AND school_id = ?',
      [class_id, schoolId]
    );
    if (!classCheck || classCheck.length === 0) {
      return NextResponse.json({ error: 'Class not found or access denied' }, { status: 403 });
    }

    // Parse the file
    const fileBuffer = await file.arrayBuffer();
    let rows: any[] = [];

    if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    } else if (file.name.endsWith('.csv')) {
      const csvText = new TextDecoder().decode(fileBuffer);
      const parsed = Papa.parse(csvText, { header: false });
      rows = parsed.data;
    } else {
      return NextResponse.json({ error: 'Unsupported file format' }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No data found in file' }, { status: 400 });
    }

    // Extract headers and map columns
    const headers = rows[0] as string[];
    const dataRows = rows.slice(1);

    // Get subject mappings
    const subjectMappings: { [key: string]: number } = {};
    const subjectNames: { [key: number]: string } = {};

    // Get all subjects for this class
    const [subjects]: any = await connection.execute(
      `SELECT s.id, s.name FROM subjects s
       JOIN class_subjects cs ON cs.subject_id = s.id
       WHERE cs.class_id = ?`,
      [class_id]
    );

    subjects.forEach((subj: any) => {
      subjectNames[subj.id] = subj.name;
    });

    // Map headers to fields
    Object.entries(mappings).forEach(([header, field]) => {
      const f = typeof field === 'string' ? field : '';
      if (f.startsWith('subject_')) {
        const subjectId = parseInt(f.replace('subject_', ''));
        subjectMappings[header] = subjectId;
      }
    });

    // Validate and prepare import data
    const importData: ImportRow[] = [];
    const errors: ValidationError[] = [];
    const warnings: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowData: ImportRow = {};

      headers.forEach((header, colIndex) => {
        const value = row[colIndex];
        if (value !== undefined && value !== null && value !== '') {
          const field = mappings[header];
          if (field === 'admission_no') {
            rowData.admission_no = String(value).trim();
          } else if (field === 'first_name') {
            rowData.first_name = String(value).trim();
          } else if (field === 'last_name') {
            rowData.last_name = String(value).trim();
          } else if (field && field.startsWith('subject_')) {
            const subjectId = parseInt(field.replace('subject_', ''));
            const score = parseFloat(value);
            if (!isNaN(score)) {
              rowData[header] = score;
            }
          }
        }
      });

      // Find student
      let studentId = null;
      if (rowData.admission_no) {
        const [students]: any = await connection.execute(
          'SELECT id FROM students WHERE admission_no = ? AND school_id = ?',
          [rowData.admission_no, schoolId]
        );
        if (students.length > 0) {
          studentId = students[0].id;
        }
      }

      if (studentId) {
        rowData.student_id = studentId;
        importData.push(rowData);
      } else {
        errors.push({
          row: i + 2, // +2 because of 0-index and header row
          message: `Student not found: ${rowData.admission_no || 'Unknown'}`,
        });
      }
    }

    // If there are critical errors, don't proceed
    if (errors.length > 0) {
      return NextResponse.json({
        success: false,
        imported: 0,
        skipped: 0,
        errors,
        warnings
      });
    }

    // Perform the import.
    //
    // BUGFIX while here: the prior implementation used
    //   Object.entries(...).forEach(async cb)
    // which fires the awaited DB writes but DOES NOT wait for them — so
    // `imported` and `skipped` were undercounted, the response often
    // returned before INSERTs landed, and the connection sometimes
    // closed mid-flight. Replaced with sequential for-of loops.
    let imported = 0;
    let updated = 0;
    let skipped = 0;

    for (const rowData of importData) {
      if (!rowData.student_id) continue;

      for (const [key, value] of Object.entries(rowData)) {
        if (!(key in subjectMappings) || typeof value !== 'number') continue;
        const subjectId = subjectMappings[key];

        const subjectAllocated = await isSubjectAllocatedToClass(connection, Number(class_id), subjectId);
        if (!subjectAllocated) {
          warnings.push(`Subject ${subjectNames[subjectId]} not allocated to class`);
          continue;
        }

        // Look up existing tuple (student, subject, term, result_type).
        // We need the id when updateExisting is on so we can UPDATE in
        // place rather than re-INSERT (which would violate any future
        // unique index and double-count the result).
        const [existingRows]: any = await connection.execute(
          `SELECT id FROM class_results
           WHERE class_id = ? AND subject_id = ? AND result_type_id = ? AND term_id <=> ? AND student_id = ?
           LIMIT 1`,
          [class_id, subjectId, result_type_id, term_id || null, rowData.student_id]
        );

        if (existingRows.length > 0) {
          if (!updateExisting) {
            skipped++;
            continue;
          }
          await connection.execute(
            `UPDATE class_results SET score = ?, updated_at = NOW() WHERE id = ?`,
            [value, existingRows[0].id]
          );
          updated++;
          continue;
        }

        await connection.execute(
          `INSERT INTO class_results (class_id, subject_id, result_type_id, term_id, academic_year_id, student_id, score)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [class_id, subjectId, result_type_id, term_id || null, academic_year_id, rowData.student_id, value]
        );
        imported++;
      }
    }

    // Log the import activity
    await connection.execute(
      'INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, changes_json, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        1, // TODO: Get actual user ID from session
        'IMPORT_RESULTS',
        'class_results',
        null,
        JSON.stringify({
          academic_year_id,
          term_id,
          class_id,
          result_type_id,
          imported,
          updated,
          skipped,
          update_existing: updateExisting,
          errors: errors.length,
          warnings: warnings.length,
          file_name: file.name,
          file_size: file.size
        }),
        req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        req.headers.get('user-agent') || 'unknown'
      ]
    );

    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      errors: [],
      warnings
    });

  } catch (error) {
    console.error('Error importing results:', error);
    return NextResponse.json({ error: 'Failed to import results' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}