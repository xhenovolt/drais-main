import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { getConnection } from '@/lib/db';
import { createErrorResponse, createSuccessResponse } from '@/middleware/auth';

/**
 * POST /api/schools/create
 * Create a new school for the current user (becomes SuperAdmin)
 */
export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('drais_session')?.value;

    if (!sessionToken) {
      return createErrorResponse('Unauthorized', 401, 'NO_SESSION', 'No session token');
    }

    const body = await request.json();
    const { name, phone, curriculum, timezone } = body;

    if (!name || !name.trim()) {
      return createErrorResponse('Bad Request', 400, 'VALIDATION_ERROR', 'School name is required');
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

      // Begin transaction
      await (connection as any).beginTransaction();

      try {
        // Create school
        const [schoolResult] = await connection.execute<any>(
          `INSERT INTO schools (name, phone, curriculum, timezone, status, setup_started_at)
           VALUES (?, ?, ?, ?, ?, NOW())`,
          [name.trim(), phone || null, curriculum || 'Kenya', timezone || 'Africa/Nairobi', 'active']
        );

        const schoolId = schoolResult.insertId;

        // Update user's school_id
        await connection.execute(
          'UPDATE users SET school_id = ? WHERE id = ?',
          [schoolId, userId]
        );

        // Create SuperAdmin role for this school
        const [roleResult] = await connection.execute<any>(
          `INSERT INTO roles (school_id, name, description, role_type, is_super_admin, is_active)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [schoolId, 'SuperAdmin', 'School Administrator with full system access', 'system', true, true]
        );

        const superAdminRoleId = roleResult.insertId;

        // Create default roles
        const defaultRoles = [
          { name: 'Admin', description: 'Administrator who can manage users and settings' },
          { name: 'Teacher', description: 'Teacher who can manage classes and marks' },
          { name: 'Bursar', description: 'Finance officer who manages fees and payments' },
          { name: 'Warden', description: 'Discipline officer who manages student conduct' },
          { name: 'Receptionist', description: 'Receptionist for visitor and student management' },
          { name: 'Staff', description: 'General staff member with basic access' },
          { name: 'Parent', description: 'Parent with access to own student records' },
        ];

        for (const role of defaultRoles) {
          await connection.execute(
            `INSERT INTO roles (school_id, name, description, role_type, is_active)
             VALUES (?, ?, ?, ?, ?)`,
            [schoolId, role.name, role.description, 'system', true]
          );
        }

        // Assign user to SuperAdmin role
        await connection.execute(
          'INSERT INTO user_roles (user_id, role_id, assigned_at) VALUES (?, ?, NOW())',
          [userId, superAdminRoleId]
        );

        // Get all permissions
        const [allPermissions] = await connection.execute<any[]>(
          'SELECT id FROM permissions WHERE is_active = TRUE'
        );

        // Assign all permissions to SuperAdmin
        for (const perm of allPermissions) {
          await connection.execute(
            'INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
            [superAdminRoleId, perm.id]
          );
        }

        await (connection as any).commit();

        return createSuccessResponse(
          { message: 'School created successfully', schoolId: schoolId },
          201
        );
      } catch (transactionError) {
        await (connection as any).rollback();
        throw transactionError;
      }
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Error creating school:', error);
    return createErrorResponse(
      'Internal Server Error',
      500,
      'CREATE_ERROR',
      error instanceof Error ? error.message : 'Failed to create school'
    );
  }
}
