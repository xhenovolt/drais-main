import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { uploadStudentPhoto, deleteCloudinaryPhoto } from '@/lib/cloudinary';
import { logAudit } from '@/lib/audit';

// GET /api/learners/[id]/photo — returns current photo_url for the learner
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { id } = await params;
  let connection;
  try {
    connection = await getConnection();
    const [rows]: any = await connection.execute(
      `SELECT p.photo_url
       FROM students s JOIN people p ON p.id = s.person_id
       WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL`,
      [id, session.schoolId]
    );
    if (!rows.length) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    return NextResponse.json({ success: true, photo_url: rows[0].photo_url ?? null });
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

// POST /api/learners/[id]/photo — upload a new photo (multipart/form-data, field: "photo")
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId, userId } = session;

  const { id: studentId } = await params;
  let connection;
  try {
    const formData = await req.formData();
    const photo = formData.get('photo') as File | null;

    if (!photo) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    if (!photo.type.startsWith('image/')) return NextResponse.json({ success: false, error: 'File must be an image' }, { status: 400 });
    if (photo.size > 10 * 1024 * 1024) return NextResponse.json({ success: false, error: 'File size must be under 10 MB' }, { status: 400 });

    connection = await getConnection();
    const [rows]: any = await connection.execute(
      'SELECT person_id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
      [studentId, schoolId]
    );
    if (!rows.length) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
    const personId = String(rows[0].person_id);

    const [peopleRows]: any = await connection.execute('SELECT photo_url FROM people WHERE id = ?', [personId]);
    const oldPhotoUrl = peopleRows[0]?.photo_url ?? null;

    const buffer = Buffer.from(await photo.arrayBuffer());
    const result = await uploadStudentPhoto(buffer, photo.size, 'drais/students', `person_${personId}`);

    await connection.execute(
      'UPDATE people SET photo_url = ?, updated_at = NOW() WHERE id = ?',
      [result.secure_url, personId]
    );

    await logAudit({
      schoolId:   schoolId,
      userId:     userId,
      action:     'PHOTO_UPLOAD',
      entityType: 'student_photo',
      entityId:   Number(personId),
      details:    { old_photo_url: oldPhotoUrl, new_photo_url: result.secure_url, student_id: studentId },
    });

    return NextResponse.json({ success: true, photo_url: result.secure_url });
  } catch (err: any) {
    console.error('[learners/photo/POST] error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Upload failed' }, { status: 500 });
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

// DELETE /api/learners/[id]/photo — remove the current photo
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId, userId } = session;

  const { id: studentId } = await params;
  let connection;
  try {
    connection = await getConnection();
    const [rows]: any = await connection.execute(
      `SELECT s.person_id, p.photo_url
       FROM students s JOIN people p ON p.id = s.person_id
       WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL`,
      [studentId, schoolId]
    );
    if (!rows.length) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });

    const { person_id: personId, photo_url: currentPhotoUrl } = rows[0];

    await connection.execute(
      'UPDATE people SET photo_url = NULL, updated_at = NOW() WHERE id = ?',
      [personId]
    );

    if (currentPhotoUrl && currentPhotoUrl.includes('cloudinary.com')) {
      await deleteCloudinaryPhoto(`drais/students/person_${personId}`).catch(() => {});
    }

    await logAudit({
      schoolId:   schoolId,
      userId:     userId,
      action:     'PHOTO_DELETE',
      entityType: 'student_photo',
      entityId:   Number(personId),
      details:    { old_photo_url: currentPhotoUrl, student_id: studentId },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[learners/photo/DELETE] error:', err);
    return NextResponse.json({ success: false, error: err?.message || 'Delete failed' }, { status: 500 });
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}
