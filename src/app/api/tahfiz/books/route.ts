import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { getSessionSchoolId } from '@/lib/auth';

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

    // Here you would save to your database
    // For now, returning success response
    const bookData = {
      id: Date.now(), // Replace with actual DB insert
      schoolId: parseInt(schoolId),
      title,
      description: description || '',
      total_units: parseInt(totalUnits),
      unit_type: unitType,
      cover_image: coverImagePath,
      pdf_file: pdfFilePath,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return NextResponse.json({
      success: true,
      message: 'Book created successfully',
      data: bookData
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

    // Here you would fetch from your database
    // For now, returning mock data
    const books = [
      {
        id: 1,
        schoolId: parseInt(schoolId),
        title: 'The Holy Quran',
        description: 'Complete Quran for memorization',
        total_units: 114,
        unit_type: 'surah',
        cover_image: null,
        pdf_file: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        total_portions: 5,
        active_learners: 12,
        completion_rate: 75
      }
    ];

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

    // Here you would delete from your database
    // Also delete associated files if they exist

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
