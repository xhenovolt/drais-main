/**
 * src/lib/apiErrorHandler.ts
 * Global error handling wrapper for all API routes
 * Ensures consistent error responses and automatic logging
 *
 * Usage:
 *   import { withErrorHandler } from '@/lib/apiErrorHandler';
 *
 *   export const POST = withErrorHandler(async (req) => {
 *     // Your logic here
 *     return createSuccessResponse(data);
 *   });
 */
import { NextRequest, NextResponse } from 'next/server';
import { ApiError, ApiErrorCode, createErrorResponse, getHttpStatus, ApiResponse } from '@/lib/apiResponse';
import { logSystemError, LogLevel, logSystemEvent } from '@/lib/systemLogger';

export interface ErrorHandlerContext {
  schoolId?: number;
  userId?: number;
  routePath: string;
  requestId: string;
}

/**
 * Extract useful debugging context from error
 */
function extractErrorContext(error: any): Record<string, any> {
  if (!error) return {};

  const context: Record<string, any> = {
    name: error.name,
    message: error.message,
  };

  // Include database-specific error info
  if (error.code) context.code = error.code;
  if (error.errno) context.errno = error.errno;
  if (error.sqlState) context.sqlState = error.sqlState;
  if (error.sqlMessage) context.sqlMessage = error.sqlMessage;

  // Never include full stack trace in response - but log it
  if (process.env.NODE_ENV === 'development') {
    context.stack = error.stack;
  }

  return context;
}

/**
 * Handle API errors consistently
 */
export async function handleApiError(
  error: any,
  context: ErrorHandlerContext
): Promise<NextResponse<ApiResponse<null>>> {
  const isDevelopment = process.env.NODE_ENV === 'development';
  const errorContext = extractErrorContext(error);

  // Log the error to system_logs
  logSystemEvent({
    schoolId: context.schoolId,
    level: LogLevel.ERROR,
    source: context.routePath,
    message: error?.message || 'Unknown API error',
    context: errorContext,
    userId: context.userId,
    requestId: context.requestId,
    statusCode: 500
  }).catch(err => console.error('Failed to log API error:', err));

  // Database constraint errors
  if (error?.code === 'ER_NO_REFERENCED_ROW' || error?.errno === 1452) {
    return createErrorResponse(
      ApiErrorCode.DATABASE_ERROR,
      'Invalid foreign key reference. Related record not found.',
      400,
      isDevelopment ? errorContext : undefined
    );
  }

  // Duplicate entry errors
  if (error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062) {
    return createErrorResponse(
      ApiErrorCode.DUPLICATE_ENTRY,
      'This record already exists.',
      409,
      isDevelopment ? errorContext : undefined
    );
  }

  // NOT NULL constraint errors
  if (error?.code === 'ER_BAD_NULL_ERROR' || error?.errno === 1048) {
    const fieldMatch = error?.message?.match(/Column '([^']+)'/);
    const fieldName = fieldMatch ? fieldMatch[1] : 'required field';
    return createErrorResponse(
      ApiErrorCode.MISSING_FIELD,
      `${fieldName} is required`,
      400,
      isDevelopment ? errorContext : undefined
    );
  }

  // Generic database error
  if (error?.message?.includes('FOREIGN KEY') || error?.message?.includes('Syntax')) {
    return createErrorResponse(
      ApiErrorCode.DATABASE_ERROR,
      'Database operation failed',
      500,
      isDevelopment ? { message: error.message } : undefined
    );
  }

  // Default server error
  return createErrorResponse(
    ApiErrorCode.SERVER_ERROR,
    'An unexpected error occurred',
    500,
    isDevelopment ? errorContext : undefined
  );
}

/**
 * Wrap API route handler with comprehensive error handling
 * Automatically catches errors, logs them, and returns standardized responses
 */
export function withErrorHandler<T extends 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'>(
  handler: (
    req: NextRequest,
    context: ErrorHandlerContext
  ) => Promise<NextResponse<ApiResponse<any>>>
) {
  return async (req: NextRequest, params?: any) => {
    const requestId = crypto.getRandomValues(new Uint8Array(16))
      .reduce((str, num) => str + num.toString(16).padStart(2, '0'), '');

    const routePath = req.nextUrl.pathname;

    // Extract school_id and user_id from request if available
    let schoolId: number | undefined;
    let userId: number | undefined;

    try {
      // Try to extract from headers (if session middleware adds them)
      const schoolIdHeader = req.headers.get('x-school-id');
      const userIdHeader = req.headers.get('x-user-id');
      if (schoolIdHeader) schoolId = parseInt(schoolIdHeader, 10);
      if (userIdHeader) userId = parseInt(userIdHeader, 10);
    } catch (e) {
      // Ignore header parsing errors
    }

    const context: ErrorHandlerContext = {
      schoolId,
      userId,
      routePath,
      requestId
    };

    try {
      return await handler(req, context);
    } catch (error) {
      console.error(`API Error [${routePath}]`, error);
      return handleApiError(error, context);
    }
  };
}

/**
 * Simpler wrapper for basic error handling without context injection
 */
export function withBasicErrorHandler(
  handler: (req: NextRequest) => Promise<NextResponse>
) {
  return async (req: NextRequest) => {
    try {
      return await handler(req);
    } catch (error) {
      console.error('API Error:', error);
      const isDevelopment = process.env.NODE_ENV === 'development';
      return createErrorResponse(
        ApiErrorCode.SERVER_ERROR,
        'An unexpected error occurred',
        500,
        isDevelopment && error instanceof Error ? { message: error.message } : undefined
      );
    }
  };
}
