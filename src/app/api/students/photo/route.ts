import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { uploadStudentPhoto, deleteCloudinaryPhoto } from '@/lib/cloudinary';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId, userId } = session;

  let connection;
  try {
    const formData = await req.formData();
    const photo = formData.get('photo') as File | null;
    const studentIdRaw = formData.get('student_id') as string | null;

    if (!photo) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    if (!photo.type.startsWith('image/')) return NextResponse.json({ success: false, error: 'File must be an image' }, { status: 400 });
    if (photo.size > 10 * 1024 * 1024) return NextResponse.json({ success: false, error: 'File size must be under 10 MB' }, { status: 400 });

    let personId: string | null = null;

    // Resolve person_id from student_id with school_id guard
    if (studentIdRaw && studentIdRaw !== 'new') {
      connection = await getConnection();
      const [rows]: any = await connection.execute(
        'SELECT person_id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
        [studentIdRaw, schoolId]
      );
      if (!rows.length) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
      personId = String(rows[0].person_id);
    }

    const buffer = Buffer.from(await photo.arrayBuffer());
    const publicIdHint = personId ? `person_${personId}` : undefined;
    const result = await uploadStudentPhoto(buffer, photo.size, 'drais/students', publicIdHint);

    // Persist to DB only when we have a known person
    if (personId) {
      if (!connection) connection = await getConnection();
      const [peopleRows]: any = await connection.execute('SELECT photo_url FROM people WHERE id = ?', [personId]);
      const oldPhotoUrl = peopleRows[0]?.photo_url ?? null;

      await connection.execute(
        'UPDATE people SET photo_url = ?, updated_at = NOW() WHERE id = ?',
        [result.secure_url, personId]
      );

      await logAudit(connection, {
        user_id: userId,
        action: 'PHOTO_UPLOAD',
        target_id: Number(personId),
        details: { old_photo_url: oldPhotoUrl, new_photo_url: result.secure_url, student_id: studentIdRaw },
      });
    }

    return NextResponse.json({ success: true, url: result.secure_url, photo_url: result.secure_url });
  } catch (err: any) {
    console.error('[photo/POST] Upload error', err);
    return NextResponse.json({ success: false, error: err?.message || 'Upload failed' }, { status: 500 });
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId, userId } = session;

  let connection;
  try {
    const body = await req.json();
    const studentId = body.student_id;
    if (!studentId) return NextResponse.json({ success: false, error: 'Missing student_id' }, { status: 400 });

    connection = await getConnection();

    // Fetch person_id + current photo_url with school_id guard
    const [rows]: any = await connection.execute(
      `SELECT s.person_id, p.photo_url
       FROM students s JOIN people p ON p.id = s.person_id
       WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL`,
      [studentId, schoolId]
    );
    if (!rows.length) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });

    const { person_id: personId, photo_url: currentPhotoUrl } = rows[0];

    // Clear photo_url in DB first (non-blocking Cloudinary delete below)
    await connection.execute(
      'UPDATE people SET photo_url = NULL, updated_at = NOW() WHERE id = ?',
      [personId]
    );

    // Attempt to delete from Cloudinary (non-fatal)
    if (currentPhotoUrl && currentPhotoUrl.includes('cloudinary.com')) {
      const publicId = `drais/students/person_${personId}`;
      await deleteCloudinaryPhoto(publicId).catch(() => {});
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
    console.error('[photo/DELETE] error', err);
    return NextResponse.json({ success: false, error: err?.message || 'Delete failed' }, { status: 500 });
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}
