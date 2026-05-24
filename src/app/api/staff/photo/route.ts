import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { uploadStudentPhoto, deleteCloudinaryPhoto } from '@/lib/cloudinary';
import { logAudit } from '@/lib/audit';

/**
 * Staff photo management.
 *
 *   POST   /api/staff/photo  multipart { photo: File, staff_id: number }
 *   DELETE /api/staff/photo  json      { staff_id: number }
 *
 * Mirrors the working pattern from /api/students/photo. Resolves the
 * staff row's person_id, writes the Cloudinary URL to people.photo_url
 * (the same column students share, since both link to `people`), and
 * stores the asset under `drais/staff/person_<id>` so the public_id is
 * stable across uploads.
 */

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId, userId } = session;

  let connection;
  try {
    const formData = await req.formData();
    const photo = formData.get('photo') as File | null;
    const staffIdRaw = formData.get('staff_id') as string | null;

    if (!photo) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    if (!photo.type.startsWith('image/')) return NextResponse.json({ success: false, error: 'File must be an image' }, { status: 400 });
    if (photo.size > 10 * 1024 * 1024) return NextResponse.json({ success: false, error: 'File size must be under 10 MB' }, { status: 400 });
    if (!staffIdRaw) return NextResponse.json({ success: false, error: 'Missing staff_id' }, { status: 400 });

    connection = await getConnection();
    const [rows]: any = await connection.execute(
      `SELECT person_id FROM staff
        WHERE id = ? AND school_id = ? AND deleted_at IS NULL
        LIMIT 1`,
      [staffIdRaw, schoolId],
    );
    if (!rows.length) return NextResponse.json({ success: false, error: 'Staff not found' }, { status: 404 });

    const personId = String(rows[0].person_id);
    if (!personId) return NextResponse.json({ success: false, error: 'Staff has no linked person record' }, { status: 422 });

    const buffer = Buffer.from(await photo.arrayBuffer());
    const result = await uploadStudentPhoto(buffer, photo.size, 'drais/staff', `person_${personId}`);

    // Capture previous URL for the audit trail before overwriting.
    const [peopleRows]: any = await connection.execute(
      'SELECT photo_url FROM people WHERE id = ?',
      [personId],
    );
    const oldPhotoUrl = peopleRows[0]?.photo_url ?? null;

    await connection.execute(
      'UPDATE people SET photo_url = ?, updated_at = NOW() WHERE id = ?',
      [result.secure_url, personId],
    );

    await logAudit({
      schoolId,
      userId,
      action:     'PHOTO_UPLOAD',
      entityType: 'staff_photo',
      entityId:   Number(personId),
      details:    { old_photo_url: oldPhotoUrl, new_photo_url: result.secure_url, staff_id: staffIdRaw },
    });

    return NextResponse.json({ success: true, url: result.secure_url, photo_url: result.secure_url });
  } catch (err: any) {
    console.error('[staff/photo/POST] Upload error', err);
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
    const body = await req.json().catch(() => ({}));
    const staffId = body.staff_id;
    if (!staffId) return NextResponse.json({ success: false, error: 'Missing staff_id' }, { status: 400 });

    connection = await getConnection();

    const [rows]: any = await connection.execute(
      `SELECT s.person_id, p.photo_url
         FROM staff s JOIN people p ON p.id = s.person_id
        WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL
        LIMIT 1`,
      [staffId, schoolId],
    );
    if (!rows.length) return NextResponse.json({ success: false, error: 'Staff not found' }, { status: 404 });

    const { person_id: personId, photo_url: currentPhotoUrl } = rows[0];

    await connection.execute(
      'UPDATE people SET photo_url = NULL, updated_at = NOW() WHERE id = ?',
      [personId],
    );

    // Cloudinary delete is best-effort. Photo asset removal must never
    // block the DB clear — the photo_url is the source of truth.
    if (currentPhotoUrl && String(currentPhotoUrl).includes('cloudinary.com')) {
      const publicId = `drais/staff/person_${personId}`;
      await deleteCloudinaryPhoto(publicId).catch(() => {});
    }

    await logAudit({
      schoolId,
      userId,
      action:     'PHOTO_DELETE',
      entityType: 'staff_photo',
      entityId:   Number(personId),
      details:    { old_photo_url: currentPhotoUrl, staff_id: staffId },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[staff/photo/DELETE] error', err);
    return NextResponse.json({ success: false, error: err?.message || 'Delete failed' }, { status: 500 });
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}
