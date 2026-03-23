import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getSessionSchoolId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const formData = await req.formData();
    const photo = formData.get('photo') as File;
    const studentId = formData.get('student_id') as string;
    const personId = formData.get('person_id') as string;

    if (!photo) {
      return NextResponse.json({
        success: false,
        error: 'Photo is required'
      }, { status: 400 });
    }

    // Validate file type
    if (!photo.type.startsWith('image/')) {
      return NextResponse.json({
        success: false,
        error: 'File must be an image'
      }, { status: 400 });
    }

    // Validate file size (5MB limit)
    if (photo.size > 5 * 1024 * 1024) {
      return NextResponse.json({
        success: false,
        error: 'File size must be less than 5MB'
      }, { status: 400 });
    }

    connection = await getConnection();

    let targetPersonId = personId;

    // If no person_id provided, get it from student_id
    if (!targetPersonId && studentId) {
      const [studentData] = await connection.execute(
        'SELECT person_id FROM students WHERE id = ?',
        [studentId]
      ) as any[];

      if (studentData.length === 0) {
        return NextResponse.json({
          success: false,
          error: 'Student not found'
        }, { status: 404 });
      }

      targetPersonId = studentData[0].person_id;
    }

    // If still no person_id, try to get it from the student record in the database
    if (!targetPersonId) {
      return NextResponse.json({
        success: false,
        error: 'Student ID or Person ID is required'
      }, { status: 400 });
    }

    // Verify person exists
    const [personExists] = await connection.execute(
      'SELECT id, photo_url FROM people WHERE id = ?',
      [targetPersonId]
    ) as any[];

    if (personExists.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Person not found'
      }, { status: 404 });
    }

    // Create uploads directory if it doesn't exist
    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'students');
    try {
      await mkdir(uploadsDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const fileExtension = path.extname(photo.name);
    const fileName = `person_${targetPersonId}_${timestamp}_${randomSuffix}${fileExtension}`;
    const filePath = path.join(uploadsDir, fileName);
    const publicUrl = `/uploads/students/${fileName}`;

    // Save file
    const bytes = await photo.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Get old photo URL for audit log
    const oldPhotoUrl = personExists[0]?.photo_url;

    // Update database
    await connection.execute(
      'UPDATE people SET photo_url = ?, updated_at = NOW() WHERE id = ?',
      [publicUrl, targetPersonId]
    );

    // Log the action in audit_log
    await connection.execute(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, changes_json, ip, user_agent) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        null, // TODO: Get from session
        'photo_upload',
        'student_photo',
        targetPersonId,
        JSON.stringify({
          old_photo_url: oldPhotoUrl,
          new_photo_url: publicUrl,
          file_name: photo.name,
          file_size: photo.size,
          student_id: studentId
        }),
        req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || null,
        req.headers.get('user-agent') || null
      ]
    );

    return NextResponse.json({
      success: true,
      message: 'Photo uploaded successfully',
      photo_url: publicUrl
    });

  } catch (error: any) {
    console.error('Photo upload error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to upload photo',
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
