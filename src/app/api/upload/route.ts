import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { uploadStudentPhoto } from '@/lib/cloudinary';

/**
 * POST /api/upload
 * Generic Cloudinary image upload. Accepts multipart form data with a single "file" field.
 * Optional form fields: folder (default: "drais/general"), publicId
 * Returns: { success, url, public_id }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Invalid file type. Allowed: JPEG, PNG, WebP, GIF, SVG' }, { status: 400 });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: 'File too large. Maximum 5MB allowed.' }, { status: 400 });
    }

    const folder = (formData.get('folder') as string) || `drais/school-${session.schoolId}`;
    const publicId = formData.get('publicId') as string | undefined;

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const result = await uploadStudentPhoto(buffer, file.size, folder, publicId || undefined);

    return NextResponse.json({
      success: true,
      url: result.secure_url,
      public_id: result.public_id,
      bytes: result.bytes,
      width: result.width,
      height: result.height,
    });
  } catch (error: any) {
    console.error('[upload POST]', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error.message },
      { status: 500 }
    );
  }
}
