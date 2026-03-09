import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getConnection } from '@/lib/db';
import { createErrorResponse, createSuccessResponse } from '@/middleware/auth';

/**
 * POST /api/schools/select
 * Select a school for the current user
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('drais_session')?.value;

    if (!sessionToken) {
      return createErrorResponse('Unauthorized', 401, 'NO_SESSION', 'No session token');
    }

    const body = await request.json();
    const { schoolId } = body;

    if (!schoolId) {
      return createErrorResponse('Bad Request', 400, 'VALIDATION_ERROR', 'schoolId is required');
    }

    const connection = await getConnection();

    try {
      // Get user from session
      const [sessions] = await connection.execute<any[]>(
        `SELECT user_id FROM sessions WHERE token = ? AND expires_at > NOW()`,
        [sessionToken]
      );

      if (sessions.length === 0) {
        return createErrorResponse('Unauthorized', 401, 'INVALID_SESSION', 'Session expired or invalid');
      }

      const userId = sessions[0].user_id;

      // Verify school exists
      const [schools] = await connection.execute<any[]>(
        'SELECT id FROM schools WHERE id = ? AND (status = "active" OR status = "pending")',
        [schoolId]
      );

      if (schools.length === 0) {
        return createErrorResponse('Not Found', 404, 'SCHOOL_NOT_FOUND', 'School not found');
      }

      // Update user's school_id
      await connection.execute(
        'UPDATE users SET school_id = ? WHERE id = ?',
        [schoolId, userId]
      );

      // If user has no roles in this school, create default Staff role
      const [userRoles] = await connection.execute<any[]>(
        `SELECT ur.role_id FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = ? AND r.school_id = ?`,
        [userId, schoolId]
      );

      if (userRoles.length === 0) {
        // Get or create Staff role
        const [staffRole] = await connection.execute<any[]>(
          `SELECT id FROM roles WHERE school_id = ? AND name = 'Staff'`,
          [schoolId]
        );

        let roleId;
        if (staffRole.length > 0) {
          roleId = staffRole[0].id;
        } else {
          const [newRole] = await connection.execute<any>(
            `INSERT INTO roles (school_id, name, description, role_type, is_active)
             VALUES (?, ?, ?, ?, ?)`,
            [schoolId, 'Staff', 'General staff member', 'system', true]
          );
          roleId = newRole.insertId;
        }

        // Assign role to user
        await connection.execute(
          'INSERT IGNORE INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, NOW())',
          [userId, roleId]
        );
      }

      return createSuccessResponse({ message: 'School selected successfully' }, 200);
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Error selecting school:', error);
    return createErrorResponse(
      'Internal Server Error',
      500,
      'SELECT_ERROR',
      error instanceof Error ? error.message : 'Failed to select school'
    );
  }
}
