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
    const photos      = formData.getAll('photos')      as File[];
    const personIds   = formData.getAll('person_ids')  as string[];
    const studentIds  = formData.getAll('student_ids') as string[];

    // Accept either person_ids (people.id) or student_ids (students.id)
    const rawIds = personIds.length ? personIds : studentIds;
    const idMode = personIds.length ? 'person' : 'student';

    if (!photos.length || !rawIds.length || photos.length !== rawIds.length) {
      return NextResponse.json({
        success: false,
        error:   'Photos and ids (person_ids or student_ids) must be provided and match in count',
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

    const rawIdList = rawIds.map(Number).filter(n => !isNaN(n));
    if (rawIdList.length !== rawIds.length) {
      return NextResponse.json({ success: false, error: 'Invalid IDs' }, { status: 400 });
    }

    connection = await getConnection();

    // Resolve person IDs and verify school ownership
    let resolvedPersonIds: number[];

    if (idMode === 'student') {
      // Resolve student IDs → person IDs in one query
      const placeholders = rawIdList.map(() => '?').join(',');
      const [rows]: any = await connection.execute(
        `SELECT s.id as student_id, s.person_id
         FROM students s
         WHERE s.id IN (${placeholders}) AND s.school_id = ? AND s.deleted_at IS NULL`,
        [...rawIdList, session.schoolId]
      );
      if (rows.length !== rawIdList.length) {
        return NextResponse.json({ success: false, error: 'One or more student IDs not found or do not belong to your school' }, { status: 404 });
      }
      // Preserve input order
      const studentToPersonMap = new Map<number, number>(rows.map((r: any) => [r.student_id, r.person_id]));
      resolvedPersonIds = rawIdList.map(sid => studentToPersonMap.get(sid)!);
    } else {
      // person_ids mode — verify via people JOIN students
      const placeholders = rawIdList.map(() => '?').join(',');
      const [existing]: any = await connection.execute(
        `SELECT p.id FROM people p
         JOIN students s ON s.person_id = p.id AND s.school_id = ? AND s.deleted_at IS NULL
         WHERE p.id IN (${placeholders})`,
        [session.schoolId, ...rawIdList],
      );
      if (existing.length !== rawIdList.length) {
        return NextResponse.json({ success: false, error: 'One or more person IDs not found or do not belong to your school' }, { status: 404 });
      }
      resolvedPersonIds = rawIdList;
    }

    await connection.beginTransaction();

    const results: any[] = [];

    for (let i = 0; i < photos.length; i++) {
      const photo    = photos[i];
      const personId = resolvedPersonIds[i];
      try {
        const [oldRows]: any = await connection.execute('SELECT photo_url FROM people WHERE id = ?', [personId]);
        const oldPhotoUrl    = oldRows[0]?.photo_url ?? null;

        const buffer = Buffer.from(await photo.arrayBuffer());
        const result = await uploadStudentPhoto(buffer, photo.size, 'drais/students', `person_${personId}`);

        await connection.execute(
          `UPDATE people SET photo_url = ?, updated_at = NOW()
           WHERE id = ? AND EXISTS (
             SELECT 1 FROM students s WHERE s.person_id = ? AND s.school_id = ? AND s.deleted_at IS NULL
           )`,
          [result.secure_url, personId, personId, session.schoolId],
        );

        await logAudit({
          schoolId:   session.schoolId,
          userId:     session.userId,
          action:     'BULK_PHOTO_UPLOAD',
          entityType: 'student_photo',
          entityId:   personId,
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
