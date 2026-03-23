import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const formData = await req.formData();
    const photos = formData.getAll('photos') as File[];
    const personIds = formData.getAll('person_ids') as string[];

    if (!photos.length || !personIds.length || photos.length !== personIds.length) {
      return NextResponse.json({
        success: false,
        error: 'Photos and person IDs must be provided and match in count'
      }, { status: 400 });
    }

    // Allowed image MIME types
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const MAX_BYTES = 100 * 1024 * 1024; // 100 MB
    const COMPRESS_THRESHOLD = 5 * 1024 * 1024; // 5 MB

    // Validate files
    for (const photo of photos) {
      if (!photo.type || !allowedTypes.includes(photo.type.toLowerCase())) {
        return NextResponse.json({
          success: false,
          error: `File ${photo.name} is not an accepted image type`
        }, { status: 400 });
      }
      if (photo.size > MAX_BYTES) {
        return NextResponse.json({
          success: false,
          error: `File ${photo.name} exceeds ${MAX_BYTES / (1024 * 1024)}MB limit`
        }, { status: 400 });
      }
    }

    connection = await getConnection();

    // Verify person IDs
    const personIdList = personIds.map(id => parseInt(id)).filter(id => !isNaN(id));
    if (personIdList.length !== personIds.length) {
      return NextResponse.json({
        success: false,
        error: 'Invalid person IDs provided'
      }, { status: 400 });
    }

    const placeholders = personIdList.map(() => '?').join(',');
    const [peopleExist] = await connection.execute(
      `SELECT id FROM people WHERE id IN (${placeholders})`,
      personIdList
    ) as any[];

    if (peopleExist.length !== personIdList.length) {
      return NextResponse.json({
        success: false,
        error: 'One or more person IDs not found'
      }, { status: 404 });
    }

    // Ensure uploads directory
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'students');
    await mkdir(uploadsDir, { recursive: true });

    const uploadResults: any[] = [];
    const auditLogs: any[] = [];

    try {
      await connection.beginTransaction();

      for (let i = 0; i < photos.length; i++) {
        const photo = photos[i];
        const personId = personIdList[i];

        try {
          const arrayBuf = await photo.arrayBuffer();
          const inputBuffer = Buffer.from(arrayBuf);

          // Determine whether to compress
          let finalBuffer = inputBuffer;
          let outputExt = path.extname(photo.name) || '.jpg';
          let compressed = false;

          if (inputBuffer.byteLength > COMPRESS_THRESHOLD && inputBuffer.byteLength <= MAX_BYTES) {
            try {
              const mime = photo.type.toLowerCase();
              const transformer = sharp(inputBuffer).rotate().resize({
                width: 1600,
                height: 1600,
                fit: 'inside',
                withoutEnlargement: true
              });

              if (mime === 'image/png' || mime === 'image/webp') {
                finalBuffer = await transformer.webp({ quality: 80 }).toBuffer();
                outputExt = '.webp';
              } else {
                // jpg/jpeg and other image/* fall back to jpeg
                finalBuffer = await transformer.jpeg({ quality: 80 }).toBuffer();
                outputExt = '.jpg';
              }

              compressed = true;
            } catch (compressErr) {
              console.error(`Compression failed for person ${personId}:`, compressErr);
              // fallback to original buffer (no compression) but continue processing
              finalBuffer = inputBuffer;
              compressed = false;
            }
          } else {
            // small file path: keep original buffer and extension
            if (!outputExt || outputExt === '') {
              // try to infer
              if (photo.type === 'image/png') outputExt = '.png';
              else if (photo.type === 'image/webp') outputExt = '.webp';
              else outputExt = '.jpg';
            }
          }

          // Write file
          const timestamp = Date.now();
          const randomSuffix = Math.random().toString(36).substring(2, 8);
          const safeBase = `person_${personId}_${timestamp}_${randomSuffix}`;
          const fileName = `${safeBase}${outputExt}`;
          const filePath = path.join(uploadsDir, fileName);
          const publicUrl = `/uploads/students/${fileName}`;

          await writeFile(filePath, finalBuffer);

          // Get old photo_url
          const [oldData] = await connection.execute(
            'SELECT photo_url FROM people WHERE id = ?',
            [personId]
          ) as any[];
          const oldPhotoUrl = oldData[0]?.photo_url;

          // Update DB
          await connection.execute(
            'UPDATE people SET photo_url = ?, updated_at = NOW() WHERE id = ?',
            [publicUrl, personId]
          );

          // Prepare audit log
          auditLogs.push({
            actor_user_id: null,
            action: 'bulk_photo_upload',
            entity_type: 'student_photo',
            entity_id: personId,
            changes_json: JSON.stringify({
              old_photo_url: oldPhotoUrl,
              new_photo_url: publicUrl,
              original_file_name: photo.name,
              original_file_size: photo.size,
              final_file_size: finalBuffer.byteLength,
              compressed
            }),
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
            user_agent: req.headers.get('user-agent') || null
          });

          uploadResults.push({
            person_id: personId,
            photo_url: publicUrl,
            original_file_size: photo.size,
            final_file_size: finalBuffer.byteLength,
            compressed,
            message: compressed ? 'Image compressed and uploaded successfully' : 'Image uploaded without compression',
            success: true
          });

        } catch (fileError) {
          console.error(`Error processing photo for person ${personId}:`, fileError);
          uploadResults.push({
            person_id: personId,
            success: false,
            error: `Failed to process photo for person ${personId}`
          });
        }
      }

      // Insert audit logs if any
      if (auditLogs.length > 0) {
        const auditValues = auditLogs.map(log => [
          log.actor_user_id,
          log.action,
          log.entity_type,
          log.entity_id,
          log.changes_json,
          log.ip,
          log.user_agent
        ]);
        const auditPlaceholders = auditLogs.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
        await connection.execute(
          `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, changes_json, ip, user_agent) VALUES ${auditPlaceholders}`,
          auditValues.flat()
        );
      }

      await connection.commit();

      const successCount = uploadResults.filter(r => r.success).length;
      const failCount = uploadResults.filter(r => !r.success).length;

      return NextResponse.json({
        success: true,
        message: `Upload complete: ${successCount} successful, ${failCount} failed`,
        results: uploadResults,
        summary: {
          total: uploadResults.length,
          successful: successCount,
          failed: failCount
        }
      });

    } catch (transactionError) {
      if (connection) await connection.rollback();
      throw transactionError;
    }

  } catch (error: any) {
    console.error('Bulk photo upload error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to upload photos',
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
