import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { uploadStudentPhoto } from '@/lib/cloudinary';
import { logAudit } from '@/lib/audit';

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB per file

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let connection;
  try {
    const formData = await req.formData();
    const photos    = formData.getAll('photos')     as File[];
    const personIds = formData.getAll('person_ids') as string[];

    if (!photos.length || !personIds.length || photos.length !== personIds.length) {
      return NextResponse.json({
        success: false,
        error:   'Photos and person_ids must be provided and match in count',
      }, { status: 400 });
    }

    const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    for (const photo of photos) {
      if (!ALLOWED.includes(photo.type.toLowerCase())) {
        return NextResponse.json({ success: false, error: `${photo.name}: unsupported type ${photo.type}` }, { status: 400 });
      }
      if (photo.size > MAX_BYTES) {
        return NextResponse.json({ success: false, error: `${photo.name} exceeds 10 MB` }, { status: 400 });
      }
    }

    const personIdList = personIds.map(Number).filter(n => !isNaN(n));
    if (personIdList.length !== personIds.length) {
      return NextResponse.json({ success: false, error: 'Invalid person IDs' }, { status: 400 });
    }

    connection = await getConnection();

    // Verify every person exists
    const placeholders = personIdList.map(() => '?').join(',');
    const [existing]: any = await connection.execute(`SELECT id FROM people WHERE id IN (${placeholders})`, personIdList);
    if (existing.length !== personIdList.length) {
      return NextResponse.json({ success: false, error: 'One or more person IDs not found' }, { status: 404 });
    }

    await connection.beginTransaction();

    const results: any[] = [];

    for (let i = 0; i < photos.length; i++) {
      const photo    = photos[i];
      const personId = personIdList[i];
      try {
        const [oldRows]: any = await connection.execute('SELECT photo_url FROM people WHERE id = ?', [personId]);
        const oldPhotoUrl    = oldRows[0]?.photo_url ?? null;

        const buffer = Buffer.from(await photo.arrayBuffer());
        const result = await uploadStudentPhoto(buffer, photo.size, 'drais/students', `person_${personId}`);

        await connection.execute(
          'UPDATE people SET photo_url = ?, updated_at = NOW() WHERE id = ?',
          [result.secure_url, personId],
        );

        await logAudit(connection, {
          user_id:    session.userId,
          action:     'BULK_PHOTO_UPLOAD',
          entity_type:'student_photo',
          target_id:  personId,
          details:    { old_photo_url: oldPhotoUrl, new_photo_url: result.secure_url, file_name: photo.name, bytes_in: photo.size, bytes_out: result.bytes },
        });

        results.push({ person_id: personId, photo_url: result.secure_url, success: true });
      } catch (err: any) {
        console.error(`[bulk-photo-upload] person ${personId}:`, err);
        results.push({ person_id: personId, success: false, error: err.message });
      }
    }

    await connection.commit();

    const ok  = results.filter(r =>  r.success).length;
    const bad = results.filter(r => !r.success).length;

    return NextResponse.json({
      success: true,
      message: `${ok} uploaded, ${bad} failed`,
      results,
      summary: { total: results.length, successful: ok, failed: bad },
    });

  } catch (error: any) {
    if (connection) await connection.rollback().catch(() => {});
    console.error('[bulk-photo-upload] error:', error);
    return NextResponse.json({
      success: false,
      error:   'Bulk upload failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    }, { status: 500 });
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}
