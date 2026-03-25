import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

interface SearchResult {
  type: 'student' | 'class' | 'academicYear' | 'result' | 'report' | 'user';
  label: string;
  id: number;
  subtitle?: string;
}

/**
 * GLOBAL SYSTEM-WIDE SEARCH API
 * 
 * GET /api/search?q=query
 * 
 * FEATURES:
 * - Multi-tenancy: filters by school_id
 * - Grouped results by type
 * - Limit 10 per category
 * - Fast response (<300ms target)
 */

export async function GET(request: NextRequest) {
  let conn;
  try {
    // Get school context
    const session = await getSessionSchoolId(request);
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const schoolId = session.schoolId;

    // Get search query
    const query = request.nextUrl.searchParams.get('q')?.trim();
    if (!query || query.length < 1) {
      return NextResponse.json({ results: [] });
    }

    // Sanitize query for SQL (basic protection)
    const searchTerm = `%${query}%`;
    const results: SearchResult[] = [];

    conn = await getConnection();

    // STUDENTS SEARCH
    const [studentResults] = await (conn.execute as any)(
      `
        SELECT s.id, p.first_name, p.last_name, s.admission_no
        FROM students s
        JOIN people p ON s.person_id = p.id
        WHERE s.school_id = ? AND s.status = 'active' AND (
          p.first_name LIKE ? OR
          p.last_name LIKE ? OR
          CONCAT(p.first_name, ' ', p.last_name) LIKE ? OR
          s.admission_no LIKE ?
        )
        LIMIT 10
      `,
      [schoolId, searchTerm, searchTerm, searchTerm, searchTerm]
    );

    (studentResults as any[]).forEach((s: any) => {
      results.push({
        type: 'student',
        label: `${s.first_name} ${s.last_name}`,
        subtitle: s.admission_no ? `Adm: ${s.admission_no}` : undefined,
        id: s.id,
      });
    });

    // CLASSES SEARCH
    const [classResults] = await (conn.execute as any)(
      `
        SELECT id, name
        FROM classes
        WHERE school_id = ? AND name LIKE ?
        LIMIT 10
      `,
      [schoolId, searchTerm]
    );

    (classResults as any[]).forEach((c: any) => {
      results.push({
        type: 'class',
        label: c.name,
        id: c.id,
      });
    });

    // ACADEMIC YEARS SEARCH
    const [yearResults] = await (conn.execute as any)(
      `
        SELECT id, name
        FROM academic_years
        WHERE school_id = ? AND name LIKE ?
        LIMIT 10
      `,
      [schoolId, searchTerm]
    );

    (yearResults as any[]).forEach((y: any) => {
      results.push({
        type: 'academicYear',
        label: y.name,
        id: y.id,
      });
    });

    // RESULTS SEARCH (by student name)
    const [resultResults] = await (conn.execute as any)(
      `
        SELECT r.id, CONCAT(p.first_name, ' ', p.last_name) as student_name, r.student_id
        FROM results r
        JOIN students s ON r.student_id = s.id
        JOIN people p ON s.person_id = p.id
        WHERE r.school_id = ? AND (
          p.first_name LIKE ? OR
          p.last_name LIKE ? OR
          CONCAT(p.first_name, ' ', p.last_name) LIKE ?
        )
        LIMIT 10
      `,
      [schoolId, searchTerm, searchTerm, searchTerm]
    );

    (resultResults as any[]).forEach((r: any) => {
      results.push({
        type: 'result',
        label: `${r.student_name} Results`,
        subtitle: 'Exam Results',
        id: r.student_id,
      });
    });

    // USERS SEARCH
    const [userResults] = await (conn.execute as any)(
      `
        SELECT u.id, u.email, p.first_name, p.last_name, u.role
        FROM users u
        LEFT JOIN people p ON u.person_id = p.id
        WHERE u.school_id = ? AND (
          u.email LIKE ? OR
          p.first_name LIKE ? OR
          p.last_name LIKE ?
        )
        LIMIT 10
      `,
      [schoolId, searchTerm, searchTerm, searchTerm]
    );

    (userResults as any[]).forEach((u: any) => {
      results.push({
        type: 'user',
        label: u.first_name && u.last_name ? `${u.first_name} ${u.last_name}` : u.email,
        subtitle: u.role || 'User',
        id: u.id,
      });
    });

    return NextResponse.json({
      results,
      count: results.length,
      query,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Search failed' },
      { status: 500 }
    );
  }
}
