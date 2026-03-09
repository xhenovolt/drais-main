import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import * as XLSX from 'xlsx';
import { getSessionSchoolId } from '@/lib/auth';

function safe(v: any) { return (v === undefined || v === '' || v === null) ? null : v; }

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

export async function POST(request: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({
        success: false,
        error: 'No file provided'
      }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let rows: string[][] = [];

    try {
      if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
        const csvContent = buffer.toString('utf-8');
        rows = parseCSV(csvContent);
      } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel' ||
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls')
      ) {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        rows = data as string[][];
      } else {
        return NextResponse.json({
          success: false,
          error: 'Unsupported file format. Please use CSV or Excel files.'
        }, { status: 400 });
      }
    } catch (parseError) {
      return NextResponse.json({
        success: false,
        error: 'Failed to parse file. Please check the file format.'
      }, { status: 400 });
    }

    if (rows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'File is empty or contains no valid data'
      }, { status: 400 });
    }

    const headers = (rows[0] || []).map(h => String(h || '').toLowerCase().trim());
    const dataRows = rows.slice(1);

    console.log('Headers found:', headers);
    console.log('Data rows:', dataRows.length);

    // Find column indices (case-insensitive)
    const firstNameIdx = headers.findIndex(h => h.includes('first') && h.includes('name'));
    const lastNameIdx = headers.findIndex(h => h.includes('last') && h.includes('name'));
    const otherNameIdx = headers.findIndex(h => h.includes('other') && h.includes('name'));
    const genderIdx = headers.findIndex(h => h === 'gender');
    const dobIdx = headers.findIndex(h => h.includes('date') && h.includes('birth'));
    const phoneIdx = headers.findIndex(h => h === 'phone');
    const emailIdx = headers.findIndex(h => h === 'email');
    const addressIdx = headers.findIndex(h => h === 'address');
    const classIdx = headers.findIndex(h => h === 'class');
    const streamIdx = headers.findIndex(h => h === 'stream');
    const villageIdx = headers.findIndex(h => h === 'village');
    const statusIdx = headers.findIndex(h => h === 'status');

    console.log('Column indices:', {
      firstNameIdx, lastNameIdx, otherNameIdx, genderIdx, dobIdx,
      phoneIdx, emailIdx, addressIdx, classIdx, streamIdx, villageIdx, statusIdx
    });

    // Validate required columns
    if (firstNameIdx === -1 || lastNameIdx === -1) {
      return NextResponse.json({
        success: false,
        error: 'Missing required columns. Please ensure your file has "First Name" and "Last Name" columns.',
        details: `Found columns: ${headers.join(', ')}`
      }, { status: 400 });
    }

    connection = await getConnection();

    try {
      // Fetch mapping data
      const [classes]: any = await connection.execute('SELECT id, name FROM classes');
      const [streams]: any = await connection.execute('SELECT id, name FROM streams');
      const [villages]: any = await connection.execute('SELECT id, name FROM villages');
      const [years]: any = await connection.execute('SELECT id FROM academic_years WHERE status = "active" LIMIT 1');
      const [terms]: any = await connection.execute('SELECT id FROM terms WHERE is_active = 1 LIMIT 1');

      const classMap = new Map((classes || []).map((c: any) => [c.name.toLowerCase(), c.id]));
      const streamMap = new Map((streams || []).map((s: any) => [s.name.toLowerCase(), s.id]));
      const villageMap = new Map((villages || []).map((v: any) => [v.name.toLowerCase(), v.id]));

      const yearId = years?.[0]?.id || null;
      const termId = terms?.[0]?.id || null;

      const results = {
        total: dataRows.length,
        successful: 0,
        failed: 0,
        errors: [] as string[]
      };

      // Process each row
      for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
        const row = dataRows[rowIdx];
        const rowNum = rowIdx + 2;

        try {
          const firstName = safe(String(row[firstNameIdx] || '').trim());
          const lastName = safe(String(row[lastNameIdx] || '').trim());

          if (!firstName || !lastName) {
            results.errors.push(`Row ${rowNum}: First name and last name are required`);
            results.failed++;
            continue;
          }

          await connection.beginTransaction();

          try {
            // Insert person
            const [personResult]: any = await connection.execute(
              'INSERT INTO people (school_id, first_name, last_name, other_name, gender, date_of_birth, phone, email, address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [
                1,
                firstName,
                lastName,
                safe(String(row[otherNameIdx] || '').trim()),
                safe(String(row[genderIdx] || '').trim()),
                safe(String(row[dobIdx] || '').trim()),
                safe(String(row[phoneIdx] || '').trim()),
                safe(String(row[emailIdx] || '').trim()),
                safe(String(row[addressIdx] || '').trim())
              ]
            );
            const personId = personResult.insertId;

            // Generate sequential admission number
            const year = new Date().getFullYear();
            const [admRows]: any = await connection.execute(
              `SELECT admission_no FROM students 
               WHERE school_id = ? AND admission_no LIKE ? 
               ORDER BY CAST(SUBSTRING_INDEX(SUBSTRING_INDEX(admission_no, '/', 2), '/', -1) AS UNSIGNED) DESC 
               LIMIT 1`,
              [1, `XHN/%/${year}`]
            );
            let seq = 1;
            if (admRows.length && admRows[0].admission_no) {
              const parts = admRows[0].admission_no.split('/');
              const num = parseInt(parts[1] || '0', 10);
              seq = num + 1;
            }
            const padded = String(seq).padStart(4, '0');
            const admission_no = `XHN/${padded}/${year}`;
            
            // Insert student
            const [studentResult]: any = await connection.execute(
              'INSERT INTO students (school_id, person_id, admission_no, village_id, status, notes) VALUES (?, ?, ?, ?, ?, ?)',
              [
                1,
                personId,
                admission_no,
                safe(villageMap.get(String(row[villageIdx] || '').toLowerCase())),
                safe(String(row[statusIdx] || 'active').trim()),
                `Bulk imported from file on ${new Date().toISOString()}`
              ]
            );
            const studentId = studentResult.insertId;

            // Insert enrollment if class is provided
            if (classIdx !== -1 && row[classIdx]) {
              const className = String(row[classIdx] || '').trim();
              const classId = classMap.get(className.toLowerCase());

              if (classId) {
                const streamName = streamIdx !== -1 ? String(row[streamIdx] || '').trim() : null;
                const streamId = streamName ? streamMap.get(streamName.toLowerCase()) : null;

                await connection.execute(
                  'INSERT INTO enrollments (student_id, class_id, stream_id, academic_year_id, term_id, status) VALUES (?, ?, ?, ?, ?, ?)',
                  [studentId, classId, streamId || null, yearId, termId, 'active']
                );
              }
            }

            await connection.commit();
            results.successful++;
          } catch (innerErr: any) {
            await connection.rollback();
            throw innerErr;
          }
        } catch (rowError: any) {
          console.error(`Error processing row ${rowNum}:`, rowError);
          results.errors.push(`Row ${rowNum}: ${rowError.message || 'Unknown error'}`);
          results.failed++;
        }
      }

      return NextResponse.json({
        success: true,
        message: `Import completed: ${results.successful} successful, ${results.failed} failed`,
        data: results
      });
    } catch (dbError: any) {
      console.error('Database error:', dbError);
      throw dbError;
    }

  } catch (error: any) {
    console.error('Import error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to import students data',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (closeError) {
        console.error('Error closing connection:', closeError);
      }
    }
  }
}
