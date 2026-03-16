import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import {
  createErrorResponse,
  createSuccessResponse,
  getAuthenticatedUser,
} from '@/middleware/auth';
import { hashPassword, logAuditAction } from '@/services/authService';

/**
 * GET /api/admin/users?school_id={schoolId}
 * List all users in a school (Admin/SuperAdmin only)
 */
export async function GET(request: NextRequest) {
  try {
    const tokenPayload = await getAuthenticatedUser(request);

    const schoolId = tokenPayload.schoolId;
    if (!schoolId) {
      return createErrorResponse('Forbidden', 403, 'NO_SCHOOL', 'No school associated with session');
    }

    const connection = await getConnection();

    try {
      // Get all users with their roles
      const [users] = await connection.execute<any[]>(
        `SELECT u.id, u.school_id, u.first_name, u.last_name, u.email, u.phone, 
                u.is_active, u.is_verified, u.last_login_at, u.created_at,
                GROUP_CONCAT(r.name SEPARATOR ', ') as roles
         FROM users u
         LEFT JOIN user_roles ur ON u.id = ur.user_id AND ur.is_active = TRUE
         LEFT JOIN roles r ON ur.role_id = r.id
         WHERE u.school_id = ? AND u.deleted_at IS NULL
         GROUP BY u.id
         ORDER BY u.created_at DESC`,
        [tokenPayload.schoolId]
      );

      return createSuccessResponse({
        users: users.map(u => ({
          ...u,
          roles: u.roles ? u.roles.split(', ') : [],
        })),
      });
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Get users error:', error);
    return createErrorResponse(
      'Internal Server Error',
      500,
      'INTERNAL_ERROR'
    );
  }
}

/**
 * POST /api/admin/users
 * Create a new user (Admin/SuperAdmin only)
 */
export async function POST(request: NextRequest) {
  try {
    const tokenPayload = await getAuthenticatedUser(request);

    const body = await request.json();
    const { first_name, last_name, email, password, phone, role_id } = body;

    // Check permission
    if (!tokenPayload.isSuperAdmin && !tokenPayload.permissions.includes('user.create')) {
      return createErrorResponse(
        'Forbidden',
        403,
        'FORBIDDEN',
        'You do not have permission to create users'
      );
    }

    // Validation
    if (!first_name || !last_name || !email || !password || !role_id) {
      return createErrorResponse(
        'Bad Request',
        400,
        'VALIDATION_ERROR',
        'Missing required fields'
      );
    }

    const connection = await getConnection();

    try {
      // Check if email already exists in school
      const [existingUsers] = await connection.execute<any[]>(
        'SELECT id FROM users WHERE school_id = ? AND email = ? AND deleted_at IS NULL',
        [tokenPayload.schoolId, email]
      );

      if (existingUsers.length > 0) {
        return createErrorResponse(
          'Conflict',
          409,
          'EMAIL_EXISTS',
          'Email already exists in this school'
        );
      }

      // Verify role belongs to school
      const [roles] = await connection.execute<any[]>(
        'SELECT id FROM roles WHERE id = ? AND school_id = ?',
        [role_id, tokenPayload.schoolId]
      );

      if (roles.length === 0) {
        return createErrorResponse(
          'Bad Request',
          400,
          'INVALID_ROLE',
          'Invalid role for this school'
        );
      }

      // Hash password
      const passwordHash = await hashPassword(password);

      // Create user - initially inactive, needs to be activated and verify email
      const [result] = await connection.execute<any>(
        `INSERT INTO users (school_id, first_name, last_name, email, phone, password_hash, is_active, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
        [tokenPayload.schoolId, first_name, last_name, email, phone || null, passwordHash, false, tokenPayload.user_id]
      );

      const userId = Number(result.insertId);

      // Assign role
      await connection.execute(
        'INSERT INTO user_roles (user_id, role_id, assigned_by, assigned_at) VALUES (?, ?, ?, NOW())',
        [userId, role_id, tokenPayload.user_id]
      );

      // Log user creation
      await logAuditAction(
        BigInt(tokenPayload.schoolId!),
        'user_created',
        'user',
        BigInt(userId),
        BigInt(tokenPayload.user_id),
        {
          new_values: { email, first_name, last_name, role_id },
          status: 'success',
        }
      );

      return createSuccessResponse(
        {
          message: 'User created successfully. They will need to activate their account.',
          user: {
            id: userId,
            schoolId: tokenPayload.schoolId,
            first_name,
            last_name,
            email,
            is_active: false,
            created_at: new Date(),
          },
        },
        201
      );
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Create user error:', error);
    return createErrorResponse(
      'Internal Server Error',
      500,
      'INTERNAL_ERROR'
    );
  }
}
