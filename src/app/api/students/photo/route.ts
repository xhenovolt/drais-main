import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { IncomingForm } from 'formidable';
import sharp from 'sharp';
import { getSessionSchoolId } from '@/lib/auth';

// NOTE: You must install formidable and sharp on the server:
// npm install formidable sharp
// Also ensure sharp is available in the deployment environment.

export const config = {
  api: {
    bodyParser: false, // we use formidable
  },
};

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads', 'students');

// ensure upload dir exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function parseForm(req: any): Promise<{ fields: any; files: any }> {
  return new Promise((resolve, reject) => {
    const form = new IncomingForm({ multiples: false, keepExtensions: true, maxFileSize: 200 * 1024 * 1024 }); // cap 200MB server-side
    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);
      resolve({ fields, files });
    });
  });
}

export async function POST(req: Request) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  try {
    const { fields, files } = await parseForm((req as any));
    const studentId = fields.student_id;
    const photo = (files.photo as any) || files.file;

    if (!studentId) {
      return NextResponse.json({ success: false, error: 'Missing student_id' }, { status: 400 });
    }
    if (!photo || !photo.filepath && !photo.path && !photo.path) {
      // formidable v2 provides filepath; fallbacks applied
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const tmpPath = photo.filepath || photo.path || photo.filepath;
    const originalName = photo.originalFilename || photo.name || `student-${Date.now()}.jpg`;
    const ext = path.extname(originalName) || '.jpg';
    const filename = `student-${studentId}-${Date.now()}${ext}`;
    const destPath = path.join(UPLOAD_DIR, filename);

    const stat = fs.statSync(tmpPath);
    // If file > 10MB, perform server-side compression using sharp to ensure storage cap
    if (stat.size > 10 * 1024 * 1024) {
      try {
        await sharp(tmpPath)
          .resize({ width: 1920, withoutEnlargement: true })
          .jpeg({ quality: 80 })
          .toFile(destPath);
      } catch (err) {
        // fallback to moving file
        fs.copyFileSync(tmpPath, destPath);
      }
    } else {
      // move the file to uploads directory
      fs.copyFileSync(tmpPath, destPath);
    }

    // Optionally remove tmp upload (formidable keeps temp file)
    try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }

    const publicUrl = `/uploads/students/${filename}`;

    // TODO: Update the student's photo_url in your database here.
    // Example (pseudo):
    // await db('students').where({id: studentId}).update({ photo_url: publicUrl });

    return NextResponse.json({ success: true, url: publicUrl });
  } catch (err: any) {
    console.error('Upload error', err);
    return NextResponse.json({ success: false, error: err?.message || 'Upload failed' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  try {
    const body = await req.json();
    const studentId = body.student_id;
    if (!studentId) {
      return NextResponse.json({ success: false, error: 'Missing student_id' }, { status: 400 });
    }

    // TODO: Lookup student's current photo URL from DB and remove the corresponding file.
    // Example pseudo:
    // const student = await db('students').where({id: studentId}).first();
    // const photoUrl = student?.photo_url;

    // For now, accept optional 'currentUrl' in body for deletion convenience
    const currentUrl = body.currentUrl as string | undefined;
    if (currentUrl) {
      const filename = path.basename(currentUrl);
      const filePath = path.join(UPLOAD_DIR, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    // TODO: Remove photo_url from DB, e.g. set to null or default placeholder
    // await db('students').where({id: studentId}).update({ photo_url: null });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Delete photo error', err);
    return NextResponse.json({ success: false, error: err?.message || 'Delete failed' }, { status: 500 });
  }
}
