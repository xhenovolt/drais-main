import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { findDuplicates } from '@/lib/duplicate-detection';

/**
 * GET /api/students/duplicates
 * 
 * Detects potential duplicate student records within a school
 * based on name similarity using Levenshtein distance.
 * 
 * OPTIONAL QUERY PARAMETERS:
 * - threshold: Similarity threshold (0-100, default 80)
 *   - 95+: Very likely duplicates (formatting differences)
 *   - 85-94: Likely duplicates (minor variations)
 *   - 80-84: Possible duplicates (review recommended)
 * - limit: Maximum number of matches to return (default 100)
 * 
 * Security:
 * - Requires authentication
 * - Only returns duplicates within user's school
 * 
 * Response:
 * {
 *   "success": true,
 *   "school_id": 6,
 *   "duplicates": [
 *     {
 *       "studentId1": 1,
 *       "studentId2": 2,
 *       "firstName1": "Abdul Karim",
 *       "lastName1": "Abdallah",
 *       "firstName2": "Abdul-Kariim",
 *       "lastName2": "Abdallah",
 *       "admissionNo1": "ADM-001",
 *       "admissionNo2": "ADM-002",
 *       "similarity": 95,
 *       "confidence": "high",
 *       "reason": "Same name with different formatting"
 *     }
 *   ],
 *   "total": 1
 * }
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const conn = await getConnection();
  try {
    const schoolId = session.schoolId;
    const threshold = Math.min(100, Math.max(0, parseInt(req.nextUrl.searchParams.get('threshold', 10) || '80')));
    const limit = Math.min(500, parseInt(req.nextUrl.searchParams.get('limit', 10) || '100'));

    // Fetch all non-deleted students for this school
    const [students]: any = await conn.execute(`
      SELECT s.id, p.first_name, p.last_name, s.admission_no
      FROM students s
      JOIN people p ON s.person_id = p.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      ORDER BY p.last_name, p.first_name
    `, [schoolId]);

    // Find duplicates
    const duplicates = await findDuplicates(students, threshold);

    // Limit results
    const limitedDuplicates = duplicates.slice(0, limit);

    return NextResponse.json({
      success: true,
      school_id: schoolId,
      threshold,
      total_students: students.length,
      duplicates_found: duplicates.length,
      results_returned: limitedDuplicates.length,
      duplicates: limitedDuplicates
    });
  } catch (error) {
    console.error('Error detecting duplicates:', error);
    return NextResponse.json(
      { error: 'Failed to detect duplicates' },
      { status: 500 }
    );
  } finally {
    await conn.end();
  }
}
