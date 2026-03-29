import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { createSuccessResponse, createErrorResponse, ApiErrorCode } from '@/lib/apiResponse';
import { logAudit, AuditAction } from '@/lib/audit';
import { logSystemError, logSystemEvent, LogLevel } from '@/lib/systemLogger';
import { notifyRoleAssigned } from '@/lib/notificationTrigger';

/**
 * POST /api/roles
 * Create a new role
 */
export async function POST(req: NextRequest) {
  let connection;
  const requestId = crypto.getRandomValues(new Uint8Array(16))
    .reduce((str, num) => str + num.toString(16).padStart(2, '0'), '');
  
  try {
    // Get authenticated session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return createErrorResponse(
        ApiErrorCode.UNAUTHORIZED,
        'Not authenticated',
        401
      );
    }
    const { schoolId, userId: sessionUserId } = session;

    // Parse and validate input
    const body = await req.json();
    const { name, description } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return createErrorResponse(
        ApiErrorCode.MISSING_FIELD,
        'Role name is required and must be text',
        400
      );
    }

    connection = await getConnection();

    try {
      const [result] = await connection.execute(
        'INSERT INTO roles (school_id, name, description) VALUES (?, ?, ?)',
        [schoolId || 1, name.trim(), description?.trim() || null]
      );

      const roleId = (result as any).insertId;

      // Log audit trail
      await logAudit({
        schoolId,
        userId: sessionUserId,
        action: AuditAction.CREATED_ROLE,
        entityType: 'role',
        entityId: roleId,
        details: { name: name.trim(), description: description?.trim() }
      }).catch(err => console.error('Audit log failed:', err));

      // Log success event
      await logSystemEvent({
        schoolId,
        level: LogLevel.INFO,
        source: '/api/roles',
        message: `Role created: ${name.trim()}`,
        userId: sessionUserId,
        requestId,
        context: { roleId }
      }).catch(err => console.error('System log failed:', err));

      return createSuccessResponse({
        id: roleId,
        name: name.trim(),
        description: description?.trim() || null,
        message: 'Role created successfully'
      }, 201);

    } catch (error: any) {
      // Handle specific database errors
      if (error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062) {
        return createErrorResponse(
          ApiErrorCode.DUPLICATE_ENTRY,
          'A role with this name already exists',
          409
        );
      }

      throw error;
    }

  } catch (error: any) {
    // Log the error for debugging
    await logSystemError({
      schoolId: session?.schoolId,
      source: '/api/roles',
      message: error?.message || 'Unknown error during role creation',
      context: {
        errorCode: error?.code,
        errorErrno: error?.errno,
        errorSqlMessage: error?.sqlMessage
      },
      userId: session?.userId,
      requestId,
      statusCode: 500
    }).catch(err => console.error('Error logging failed:', err));

    console.error('Role creation error:', error);

    return createErrorResponse(
      ApiErrorCode.DATABASE_ERROR,
      'Failed to create role. Please check the data and try again.',
      500,
      process.env.NODE_ENV === 'development' ? { message: error.message } : undefined
    );
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (e) {
        console.error('Connection cleanup error:', e);
      }
    }
  }
}
