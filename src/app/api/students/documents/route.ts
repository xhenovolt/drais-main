/**
 * /api/students/documents
 *
 * GET   — list documents for the current school (optionally filtered by student_id).
 * POST  — upload a learner document.
 *
 * WHY THIS ROUTE WAS REWRITTEN:
 *   The previous POST shipped with a TODO and stubbed the file URL as
 *   `/uploads/documents/<ts>_<filename>`. No bytes were ever written;
 *   the DB row pointed at a non-existent path, so downloads silently
 *   404'd. The "upload" looked successful but the document was lost.
 *
 *   This rewrite uploads the file to Cloudinary using resource_type:'auto'
 *   so PDFs / DOCX / images all work, persists the secure_url + public_id,
 *   and coerces empty optional fields to NULL so MySQL doesn't choke on
 *   empty-string-into-DATE.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import cloudinary from '@/lib/cloudinary';

export async function GET(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    const studentId = searchParams.get('student_id');

    connection = await getConnection();

    let sql = `
      SELECT
        d.id,
        d.owner_id as student_id,
        d.document_type_id,
        d.file_name,
        d.file_url,
        d.mime_type,
        d.file_size,
        d.issued_by,
        d.issue_date,
        d.notes,
        d.uploaded_at,
        dt.code as document_type_code,
        dt.label as document_type_label,
        p.first_name,
        p.last_name,
        s.admission_no,
        cl.name as class_name
      FROM documents d
      JOIN document_types dt ON d.document_type_id = dt.id
      JOIN students s ON d.owner_id = s.id
      JOIN people p ON s.person_id = p.id
      LEFT JOIN enrollments e ON s.id = e.student_id AND e.status = 'active'
      LEFT JOIN classes cl ON e.class_id = cl.id
      WHERE d.school_id = ? AND d.owner_type = 'student' AND d.deleted_at IS NULL
    `;

    const params: (number | string)[] = [schoolId];

    if (studentId) {
      sql += ' AND d.owner_id = ?';
      params.push(parseInt(studentId, 10));
    }

    sql += ' ORDER BY COALESCE(p.last_name, \'\') ASC, COALESCE(p.first_name, \'\') ASC, d.uploaded_at DESC';

    const [rows] = await connection.execute(sql, params);

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    console.error('Documents fetch error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch documents' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// ─── Upload helper (Cloudinary, auto resource type) ────────────────────────
//
// Cloudinary's `resource_type: 'auto'` accepts images, PDFs, and most
// office docs. We base64-encode rather than stream because the SDK's
// upload() expects a data URI for buffers — this matches the pattern
// in src/lib/cloudinary.ts:uploadStudentPhoto.
//
// 10 MB cap matches the client-side dropzone limit in AddDocumentModal.
const MAX_BYTES = 10 * 1024 * 1024;

async function uploadDocumentToCloudinary(file: File, schoolId: number, studentId: number): Promise<{ secure_url: string; public_id: string; bytes: number }> {
  const ab = await file.arrayBuffer();
  const buffer = Buffer.from(ab);
  if (buffer.byteLength > MAX_BYTES) {
    throw new Error(`File too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB) — limit is 10 MB.`);
  }
  // mimeGuess is just for the data URI prefix — Cloudinary derives
  // the real type from the bytes when resource_type:'auto' is set.
  const mimeGuess = file.type || 'application/octet-stream';
  const dataUri = `data:${mimeGuess};base64,${buffer.toString('base64')}`;
  const result = await cloudinary.uploader.upload(dataUri, {
    folder:        `drais/documents/${schoolId}/students/${studentId}`,
    resource_type: 'auto',
    use_filename:  true,
    unique_filename: true,
    overwrite:     false,
  });
  return {
    secure_url: result.secure_url,
    public_id:  result.public_id,
    bytes:      result.bytes,
  };
}

export async function POST(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const formData = await req.formData();
    // formData.get() takes ONE arg. The previous code passed `10` as a
    // second arg which was silently dropped — typescript missed it
    // because the return type is FormDataEntryValue | null.
    const studentId      = parseInt(String(formData.get('student_id') || ''), 10);
    const documentTypeId = parseInt(String(formData.get('document_type_id') || ''), 10);
    const issuedByRaw    = (formData.get('issued_by') as string | null) ?? '';
    const issueDateRaw   = (formData.get('issue_date') as string | null) ?? '';
    const notesRaw       = (formData.get('notes') as string | null) ?? '';
    const file           = formData.get('file');

    if (!studentId || !documentTypeId || !file || !(file instanceof File) || file.size === 0) {
      return NextResponse.json({
        success: false,
        error: 'Student, document type and a non-empty file are all required.',
      }, { status: 400 });
    }

    // Coerce empty optional fields to NULL so MySQL doesn't blow up
    // inserting '' into a DATE column under strict mode.
    const issuedBy  = issuedByRaw.trim().length  > 0 ? issuedByRaw.trim()  : null;
    const issueDate = issueDateRaw.trim().length > 0 ? issueDateRaw.trim() : null;
    const notes     = notesRaw.trim().length     > 0 ? notesRaw.trim()     : null;

    connection = await getConnection();

    // Verify student belongs to this school BEFORE uploading the file —
    // saves a Cloudinary call and prevents orphaned uploads when the
    // caller is unauthorised.
    const [studentRows] = await (connection.execute as any)(
      'SELECT school_id FROM students WHERE id = ? AND deleted_at IS NULL',
      [studentId],
    );
    if (!studentRows || studentRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    }
    if (studentRows[0].school_id !== schoolId) {
      return NextResponse.json({ success: false, error: 'Student not found in your school' }, { status: 404 });
    }

    // Verify document type exists for this school.
    const [typeRows] = await (connection.execute as any)(
      'SELECT id FROM document_types WHERE id = ?',
      [documentTypeId],
    );
    if (!typeRows || typeRows.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid document type' }, { status: 400 });
    }

    // Upload to Cloudinary. Any failure here means we do NOT touch the
    // documents table — caller sees a meaningful error instead of a
    // success-with-broken-URL.
    let uploaded;
    try {
      uploaded = await uploadDocumentToCloudinary(file, schoolId, studentId);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed';
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    await connection.execute(
      `INSERT INTO documents
         (school_id, owner_type, owner_id, document_type_id,
          file_name, file_url, mime_type, file_size,
          issued_by, issue_date, notes)
       VALUES (?, 'student', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        schoolId, studentId, documentTypeId,
        file.name, uploaded.secure_url, file.type || null, uploaded.bytes,
        issuedBy, issueDate, notes,
      ],
    );

    return NextResponse.json({ success: true, message: 'Document uploaded successfully', url: uploaded.secure_url });
  } catch (error) {
    console.error('Document upload error:', error);
    return NextResponse.json({ success: false, error: 'Failed to upload document' }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
