import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getConnection } from '@/lib/db';
import { createErrorResponse, createSuccessResponse } from '@/middleware/auth';

/**
 * GET /api/schools/available
 * Get schools available for the current user to join
 */
export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('drais_session')?.value;

    if (!sessionToken) {
      return createErrorResponse('Unauthorized', 401, 'NO_SESSION', 'No session token');
    }

    const connection = await getConnection();

    try {
      // Get all active schools (user can join any school initially)
      const [schools] = await connection.execute<any[]>(
        `SELECT id, name, phone, country, curriculum, timezone 
         FROM schools 
         WHERE status = 'active' OR status = 'pending'
         ORDER BY name ASC`
      );

      return createSuccessResponse({ schools }, 200);
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Error fetching schools:', error);
    return createErrorResponse(
      'Internal Server Error',
      500,
      'FETCH_ERROR',
      error instanceof Error ? error.message : 'Failed to fetch schools'
    );
  }
}
