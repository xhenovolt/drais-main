import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import * as XLSX from 'xlsx';
import {
  buildHeaderMap,
  findIntraFileDuplicates,
  rowFromRecord,
  templateHeaders,
  validateContactRow,
  normalizeEmail,
  normalizePhone,
  type ContactImportRow,
} from '@/lib/contacts/import';

import { getSessionSchoolId } from '@/lib/auth';
export async function GET(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    if (searchParams.get('mode') === 'template') {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.aoa_to_sheet([
        templateHeaders(),
        ['ADM-001', '', 'Amina', 'Hassan', '+256700000001', 'amina@example.com', 'Mother', 'guardian', '', 'Kampala', 'yes'],
      ]);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="drais_contacts_import_template.xlsx"',
        },
      });
    }
    // school_id derived from session below
    const studentId = searchParams.get('student_id');
    const search = searchParams.get('q');
    // This route previously fetched EVERY contact for EVERY student in the
    // school with no LIMIT, on a 30s poll, filtered client-side — the same
    // shape of bug that froze /finance/fees (thousands of rows shipped +
    // held in memory + re-filtered on every keystroke). Paginated + search
    // moved server-side, same pattern as that fix.
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50));
    const offset = (page - 1) * limit;

    connection = await getConnection();

    const baseFrom = `
      FROM student_contacts sc
      JOIN contacts c ON sc.contact_id = c.id AND c.deleted_at IS NULL AND c.school_id = ?
      JOIN people cp ON c.person_id = cp.id
      JOIN students s ON sc.student_id = s.id AND s.deleted_at IS NULL
      JOIN people sp ON s.person_id = sp.id
      LEFT JOIN classes cl ON cl.id = (
        SELECT e.class_id FROM enrollments e
        WHERE e.student_id = s.id AND e.status = 'active'
        ORDER BY e.id DESC LIMIT 1
      )
      WHERE s.school_id = ?
    `;
    const params: any[] = [schoolId, schoolId];
    let filters = '';

    if (studentId) { filters += ' AND sc.student_id = ?'; params.push(parseInt(studentId, 10)); }
    if (search) {
      filters += ' AND (sp.first_name LIKE ? OR sp.last_name LIKE ? OR cp.first_name LIKE ? OR cp.last_name LIKE ? OR sc.relationship LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like, like);
    }

    const [countRows]: any = await connection.execute(`SELECT COUNT(DISTINCT CONCAT(sc.student_id, ':', sc.contact_id)) AS total ${baseFrom}${filters}`, params);
    const total = Number(countRows?.[0]?.total || 0);

    const sql = `
      SELECT DISTINCT
        sc.student_id,
        sc.contact_id,
        sc.relationship,
        sc.is_primary,
        c.id,
        c.contact_type,
        c.occupation,
        c.alive_status,
        cp.first_name as contact_first_name,
        cp.last_name as contact_last_name,
        cp.phone as contact_phone,
        cp.email as contact_email,
        cp.address as contact_address,
        sp.first_name as student_first_name,
        sp.last_name as student_last_name,
        s.admission_no,
        cl.name as class_name
      ${baseFrom}${filters}
      ORDER BY COALESCE(sp.last_name, '') ASC, COALESCE(sp.first_name, '') ASC, sc.is_primary DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    });

  } catch (error: any) {
    console.error('Contacts fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch contacts'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      return handleExcelImport(req, schoolId);
    }

    const body = await req.json();
    const {
      student_id,
      first_name = '',
      last_name = '',
      phone,
      email = '',
      address = '',
      contact_type = 'guardian',
      occupation = '',
      relationship = '',
      is_primary = 0
    } = body;

    // Only require student_id and phone for quick contact collection
    if (!student_id || !phone) {
      return NextResponse.json({
        success: false,
        error: 'Student ID and phone number are required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Verify student belongs to this school
      const [studentRows] = await connection.execute(
        'SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
        [student_id, schoolId]
      );

      if (!Array.isArray(studentRows) || studentRows.length === 0) {
        throw new Error('Student not found or does not belong to your school');
      }

      const existing = await findExistingContact(connection, schoolId, Number(student_id), {
        rowNumber: 0,
        studentId: String(student_id),
        admissionNo: '',
        contactFirstName: first_name,
        contactLastName: last_name,
        phone: String(phone),
        email,
        address,
        relationship,
        contactType: contact_type,
        occupation,
        isPrimary: Boolean(is_primary),
      });
      if (existing?.linkedToStudent) {
        await connection.rollback();
        return NextResponse.json({ success: false, error: 'A contact with this phone or email is already linked to this student' }, { status: 409 });
      }
      if (existing) {
        await connection.execute(
          'INSERT INTO student_contacts (student_id, contact_id, relationship, is_primary) VALUES (?, ?, ?, ?)',
          [student_id, existing.contactId, relationship, is_primary],
        );
        await connection.commit();
        return NextResponse.json({ success: true, message: 'Existing contact linked successfully', data: { contact_id: existing.contactId } });
      }

      // Insert person record for contact (using session schoolId)
      const [personResult] = await connection.execute(`
        INSERT INTO people (school_id, first_name, last_name, phone, email, address)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [schoolId, first_name, last_name, phone, email, address]);

      const personId = personResult.insertId;

      // Insert contact record
      const [contactResult] = await connection.execute(`
        INSERT INTO contacts (school_id, person_id, contact_type, occupation, alive_status)
        VALUES (?, ?, ?, ?, 'alive')
      `, [schoolId, personId, contact_type, occupation]);

      const contactId = contactResult.insertId;

      // Link student to contact
      await connection.execute(`
        INSERT INTO student_contacts (student_id, contact_id, relationship, is_primary)
        VALUES (?, ?, ?, ?)
      `, [student_id, contactId, relationship, is_primary]);

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: 'Phone number saved successfully',
        data: { contact_id: contactId }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error: any) {
    console.error('Contact creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to save contact'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

type ImportStatus = 'ready' | 'imported' | 'duplicate_file' | 'duplicate_existing' | 'invalid';

interface PreparedContactRow {
  row: ContactImportRow;
  status: ImportStatus;
  reason?: string;
  studentId?: number;
  contactId?: number;
}

async function parseContactWorkbook(req: NextRequest): Promise<{ rows: PreparedContactRow[]; headers: string[]; error?: string }> {
  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return { rows: [], headers: [], error: 'Excel file is required' };
  if (!/\.(xlsx|xls)$/i.test(file.name)) return { rows: [], headers: [], error: 'Only .xlsx or .xls files are supported' };
  if (file.size > 25 * 1024 * 1024) return { rows: [], headers: [], error: 'Excel file must be smaller than 25 MB' };

  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { rows: [], headers: [], error: 'The workbook has no sheets' };
  const sheet = workbook.Sheets[sheetName];
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const headerRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', range: 0, blankrows: false });
  const headers = (headerRows[0] || []).map((value) => String(value).trim()).filter(Boolean);
  const headerMap = buildHeaderMap(headers);
  if (!headerMap.phone) return { rows: [], headers, error: 'The workbook must contain a phone column' };
  if (!headerMap.studentId && !headerMap.admissionNo) return { rows: [], headers, error: 'The workbook must contain student_id or admission_no' };

  const rows = records.map((record, index) => {
    const row = rowFromRecord(record, headerMap, index + 2);
    const issues = validateContactRow(row);
    return { row, status: issues.length ? 'invalid' as const : 'ready' as const, reason: issues.join('; ') };
  });
  const duplicateIssues = findIntraFileDuplicates(rows.map(({ row }) => row));
  for (const issue of duplicateIssues) {
    const prepared = rows.find(({ row }) => row.rowNumber === issue.rowNumber);
    if (prepared && prepared.status === 'ready') {
      prepared.status = 'duplicate_file';
      prepared.reason = issue.reason;
    }
  }
  return { rows, headers };
}

async function resolveStudent(connection: any, schoolId: number, row: ContactImportRow): Promise<number | null> {
  const [students] = row.studentId
    ? await connection.execute('SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1', [row.studentId, schoolId])
    : await connection.execute('SELECT id FROM students WHERE admission_no = ? AND school_id = ? AND deleted_at IS NULL LIMIT 1', [row.admissionNo, schoolId]);
  return Array.isArray(students) && students[0] ? Number(students[0].id) : null;
}

async function findExistingContact(connection: any, schoolId: number, studentId: number, row: ContactImportRow): Promise<{ contactId: number; linkedToStudent: boolean } | null> {
  const phone = normalizePhone(row.phone);
  const email = normalizeEmail(row.email);
  const [contacts] = await connection.execute(`
    SELECT c.id, cp.phone, cp.email,
      EXISTS(SELECT 1 FROM student_contacts sc2 WHERE sc2.contact_id = c.id AND sc2.student_id = ?) AS linked_to_student
    FROM contacts c
    JOIN people cp ON cp.id = c.person_id
    WHERE c.school_id = ? AND c.deleted_at IS NULL AND cp.deleted_at IS NULL
      AND (REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(cp.phone, ' ', ''), '.', ''), '-', ''), '(', ''), ')', '') = ? OR (? <> '' AND LOWER(cp.email) = ?))
    LIMIT 1
  `, [studentId, schoolId, phone, email, email]);
  if (!Array.isArray(contacts) || !contacts[0]) return null;
  return { contactId: Number(contacts[0].id), linkedToStudent: Boolean(contacts[0].linked_to_student) };
}

async function handleExcelImport(req: NextRequest, schoolId: number): Promise<NextResponse> {
  const form = await req.formData();
  const mode = String(form.get('mode') || 'preview');
  const replay = new Request(req.url, { method: 'POST', body: form });
  const parsed = await parseContactWorkbook(replay as NextRequest);
  if (parsed.error) return NextResponse.json({ success: false, error: parsed.error }, { status: 400 });

  let connection;
  try {
    connection = await getConnection();
    const prepared = parsed.rows;
    for (const item of prepared) {
      if (item.status !== 'ready') continue;
      item.studentId = await resolveStudent(connection, schoolId, item.row) ?? undefined;
      if (!item.studentId) {
        item.status = 'invalid';
        item.reason = 'student was not found in this school';
        continue;
      }
      const existing = await findExistingContact(connection, schoolId, item.studentId, item.row);
      if (existing) {
        item.contactId = existing.contactId;
        if (existing.linkedToStudent) {
          item.status = 'duplicate_existing';
          item.reason = 'this contact is already linked to this student';
        }
      }
    }

    if (mode !== 'import') {
      return NextResponse.json({ success: true, headers: parsed.headers, rows: prepared, summary: summarizeImport(prepared) });
    }

    const results = [...prepared];
    for (const item of results) {
      if (item.status !== 'ready') continue;
      try {
        await connection.beginTransaction();
        const latestExisting = await findExistingContact(connection, schoolId, item.studentId!, item.row);
        if (latestExisting?.linkedToStudent) {
          item.status = 'duplicate_existing';
          item.reason = 'this contact is already linked to this student';
          await connection.commit();
          continue;
        }
        if (latestExisting) item.contactId = latestExisting.contactId;
        if (item.contactId) {
          await connection.execute(
            'INSERT INTO student_contacts (student_id, contact_id, relationship, is_primary) VALUES (?, ?, ?, ?)',
            [item.studentId, item.contactId, item.row.relationship, item.row.isPrimary ? 1 : 0],
          );
        } else {
          const [person] = await connection.execute(
            'INSERT INTO people (school_id, first_name, last_name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)',
            [schoolId, item.row.contactFirstName, item.row.contactLastName, item.row.phone, item.row.email, item.row.address],
          );
          const [contact] = await connection.execute(
            "INSERT INTO contacts (school_id, person_id, contact_type, occupation, alive_status) VALUES (?, ?, ?, ?, 'alive')",
            [schoolId, person.insertId, item.row.contactType, item.row.occupation],
          );
          item.contactId = Number(contact.insertId);
          await connection.execute(
            'INSERT INTO student_contacts (student_id, contact_id, relationship, is_primary) VALUES (?, ?, ?, ?)',
            [item.studentId, item.contactId, item.row.relationship, item.row.isPrimary ? 1 : 0],
          );
        }
        await connection.commit();
        item.status = 'imported';
      } catch (error: any) {
        await connection.rollback();
        item.status = 'invalid';
        item.reason = error?.code === 'ER_DUP_ENTRY' ? 'duplicate relationship already exists' : 'row could not be imported';
      }
    }
    return NextResponse.json({ success: true, rows: results, summary: summarizeImport(results) });
  } catch (error) {
    console.error('Contact Excel import error:', error);
    return NextResponse.json({ success: false, error: 'Failed to process contact import' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

function summarizeImport(rows: PreparedContactRow[]) {
  return {
    total: rows.length,
    ready: rows.filter((row) => row.status === 'ready').length,
    imported: rows.filter((row) => row.status === 'imported').length,
    duplicateFile: rows.filter((row) => row.status === 'duplicate_file').length,
    duplicateExisting: rows.filter((row) => row.status === 'duplicate_existing').length,
    invalid: rows.filter((row) => row.status === 'invalid').length,
  };
}
