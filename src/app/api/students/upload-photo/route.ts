import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { uploadStudentPhoto } from '@/lib/cloudinary';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let connection;
  try {
    const formData = await req.formData();
    const photo = formData.get('photo') as File;
    const studentId = formData.get('student_id') as string;
    const personId  = formData.get('person_id') as string;

    if (!photo) return NextResponse.json({ success: false, error: 'Photo is required' }, { status: 400 });
    if (!photo.type.startsWith('image/')) return NextResponse.json({ success: false, error: 'File must be an image' }, { status: 400 });
    if (photo.size > 10 * 1024 * 1024) return NextResponse.json({ success: false, error: 'File size must be under 10 MB' }, { status: 400 });

    connection = await getConnection();

    let targetPersonId = personId;

    if (!targetPersonId && studentId) {
      const [rows]: any = await connection.execute(
        'SELECT person_id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
        [studentId, session.schoolId]
      );
      if (!rows.length) return NextResponse.json({ success: false, error: 'Student not found' }, { status: 404 });
      targetPersonId = rows[0].person_id;
    }

    if (!targetPersonId) return NextResponse.json({ success: false, error: 'Student ID or Person ID is required' }, { status: 400 });

    const [peopleRows]: any = await connection.execute('SELECT id, photo_url FROM people WHERE id = ?', [targetPersonId]);
    if (!peopleRows.length) return NextResponse.json({ success: false, error: 'Person not found' }, { status: 404 });

    const oldPhotoUrl = peopleRows[0].photo_url;

    // Upload to Cloudinary (auto-compress if > 900 KB)
    const buffer = Buffer.from(await photo.arrayBuffer());
    const result = await uploadStudentPhoto(
      buffer,
      photo.size,
      'drais/students',
      `person_${targetPersonId}`,
    );

    // Persist CDN URL
    await connection.execute(
      'UPDATE people SET photo_url = ?, updated_at = NOW() WHERE id = ?',
      [result.secure_url, targetPersonId],
    );

    await logAudit({
      schoolId:   session.schoolId,
      userId:     session.userId,
      action:     'PHOTO_UPLOAD',
      entityType: 'student_photo',
      entityId:   Number(targetPersonId),
      details:    { old_photo_url: oldPhotoUrl, new_photo_url: result.secure_url, file_name: photo.name, file_size: photo.size, student_id: studentId },
    });

    return NextResponse.json({ success: true, message: 'Photo uploaded successfully', photo_url: result.secure_url });

  } catch (error: any) {
    console.error('[upload-photo] error:', error);
    return NextResponse.json({ success: false, error: 'Failed to upload photo', details: process.env.NODE_ENV === 'development' ? error.message : undefined }, { status: 500 });
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}
