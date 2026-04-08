import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const formData = await request.formData();
    // schoolId from session auth (above)
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const totalUnits = formData.get('total_units') as string;
    const unitType = formData.get('unit_type') as string;
    const coverImage = formData.get('cover_image') as File | null;
    const pdfFile = formData.get('pdf_file') as File | null;

    // Validate required fields
    if (!title || !totalUnits || !unitType) {
      return NextResponse.json({
        success: false,
        message: 'Missing required fields'
      }, { status: 400 });
    }

    let coverImagePath = null;
    let pdfFilePath = null;

    // Handle file uploads
    if (coverImage && coverImage.size > 0) {
      const bytes = await coverImage.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Create upload directory if it doesn't exist
      const uploadDir = path.join(process.cwd(), 'public/uploads/tahfiz/covers');
      await mkdir(uploadDir, { recursive: true });
      
      // Generate unique filename
      const timestamp = Date.now();
      const extension = path.extname(coverImage.name);
      const filename = `cover_${timestamp}${extension}`;
      const filepath = path.join(uploadDir, filename);
      
      await writeFile(filepath, buffer);
      coverImagePath = `/uploads/tahfiz/covers/${filename}`;
    }

    if (pdfFile && pdfFile.size > 0) {
      const bytes = await pdfFile.arrayBuffer();
      const buffer = Buffer.from(bytes);
      
      // Create upload directory if it doesn't exist
      const uploadDir = path.join(process.cwd(), 'public/uploads/tahfiz/pdfs');
      await mkdir(uploadDir, { recursive: true });
      
      // Generate unique filename
      const timestamp = Date.now();
      const extension = path.extname(pdfFile.name);
      const filename = `pdf_${timestamp}${extension}`;
      const filepath = path.join(uploadDir, filename);
      
      await writeFile(filepath, buffer);
      pdfFilePath = `/uploads/tahfiz/pdfs/${filename}`;
    }

    // Insert into database (cover_image/pdf_file not in schema — files saved to disk only)
    const result: any[] = await query(
      `INSERT INTO tahfiz_books (school_id, title, description, total_units, unit_type)
       VALUES (?, ?, ?, ?, ?)`,
      [schoolId, title, description || null, parseInt(totalUnits, 10), unitType]
    );
    const insertedId = result[0]?.insertId ?? null;

    return NextResponse.json({
      success: true,
      message: 'Book created successfully',
      data: {
        id: insertedId,
        school_id: schoolId,
        title,
        description: description || '',
        total_units: parseInt(totalUnits, 10),
        unit_type: unitType,
        cover_image: coverImagePath,
        pdf_file: pdfFilePath,
      }
    });

  } catch (error) {
    console.error('Error creating book:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to create book',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { searchParams } = new URL(request.url);
    // schoolId now from session auth (above)
    if (!schoolId) {
      return NextResponse.json({
        success: false,
        message: 'School ID is required'
      }, { status: 400 });
    }

    // Fetch books from database with portion stats
    const books = await query(
      `SELECT
         b.id,
         b.school_id,
         b.title,
         b.description,
         b.total_units,
         b.unit_type,
         b.created_at,
         b.updated_at,
         COUNT(DISTINCT tp.id) AS total_portions,
         COUNT(DISTINCT tp.student_id) AS active_learners
       FROM tahfiz_books b
       LEFT JOIN tahfiz_plans tp ON tp.book_id = b.id AND tp.status IN ('active','in_progress')
       WHERE b.school_id = ?
       GROUP BY b.id
       ORDER BY b.created_at DESC`,
      [schoolId]
    );

    return NextResponse.json({
      success: true,
      data: books
    });

  } catch (error) {
    console.error('Error fetching books:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch books'
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSessionSchoolId(request);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const { searchParams } = new URL(request.url);
    const bookId = searchParams.get('id');
    
    if (!bookId) {
      return NextResponse.json({
        success: false,
        message: 'Book ID is required'
      }, { status: 400 });
    }

    // Delete from database (school_id check ensures tenant isolation)
    await query(
      `DELETE FROM tahfiz_books WHERE id = ? AND school_id = ?`,
      [bookId, schoolId]
    );

    return NextResponse.json({
      success: true,
      message: 'Book deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting book:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to delete book'
    }, { status: 500 });
  }
}
