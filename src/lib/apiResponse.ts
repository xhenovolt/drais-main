/**
 * src/lib/apiResponse.ts
 * Standardized API response formatting for all endpoints
 * Ensures consistent error handling and response structure
 */

import { NextResponse } from 'next/server';

/**
 * Standard API error codes
 */
export enum ApiErrorCode {
  // Auth errors (401)
  UNAUTHORIZED = 'UNAUTHORIZED',
  SESSION_INVALID = 'SESSION_INVALID',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  UNAUTHORIZED_SCHOOL = 'UNAUTHORIZED_SCHOOL',

  // Permission errors (403)
  FORBIDDEN = 'FORBIDDEN',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  SETUP_INCOMPLETE = 'SETUP_INCOMPLETE',

  // Validation errors (400)
  BAD_REQUEST = 'BAD_REQUEST',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_CREDENTIALS = 'MISSING_CREDENTIALS',
  MISSING_FIELD = 'MISSING_FIELD',
  INVALID_EMAIL = 'INVALID_EMAIL',
  INVALID_PASSWORD = 'INVALID_PASSWORD',

  // Not found errors (404)
  NOT_FOUND = 'NOT_FOUND',
  USER_NOT_FOUND = 'USER_NOT_FOUND',
  SCHOOL_NOT_FOUND = 'SCHOOL_NOT_FOUND',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',

  // Conflict errors (409)
  CONFLICT = 'CONFLICT',
  EMAIL_ALREADY_EXISTS = 'EMAIL_ALREADY_EXISTS',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',

  // Server errors (500)
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
}

/**
 * API error response object
 */
export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, any>;
}

/**
 * Standard API response wrapper
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

/**
 * Create success response
 */
export function createSuccessResponse<T>(
  data: T,
  status: number = 200
): NextResponse<ApiResponse<T>> {
  return NextResponse.json(
    {
      success: true,
      data,
    },
    { status }
  );
}

/**
 * Create error response
 */
export function createErrorResponse(
  code: ApiErrorCode,
  message: string,
  status: number = 500,
  details?: Record<string, any>
): NextResponse<ApiResponse<null>> {
  return NextResponse.json(
    {
      success: false,
      error: {
        code,
        message,
        details,
      },
    },
    { status }
  );
}

/**
 * Map error code to HTTP status
 */
export function getHttpStatus(code: ApiErrorCode): number {
  if (
    code === ApiErrorCode.UNAUTHORIZED ||
    code === ApiErrorCode.SESSION_INVALID ||
    code === ApiErrorCode.SESSION_EXPIRED ||
    code === ApiErrorCode.UNAUTHORIZED_SCHOOL
  ) {
    return 401;
  }

  if (
    code === ApiErrorCode.FORBIDDEN ||
    code === ApiErrorCode.PERMISSION_DENIED ||
    code === ApiErrorCode.SETUP_INCOMPLETE
  ) {
    return 403;
  }

  if (
    code === ApiErrorCode.BAD_REQUEST ||
    code === ApiErrorCode.INVALID_INPUT ||
    code === ApiErrorCode.MISSING_CREDENTIALS ||
    code === ApiErrorCode.MISSING_FIELD ||
    code === ApiErrorCode.INVALID_EMAIL ||
    code === ApiErrorCode.INVALID_PASSWORD
  ) {
    return 400;
  }

  if (
    code === ApiErrorCode.NOT_FOUND ||
    code === ApiErrorCode.USER_NOT_FOUND ||
    code === ApiErrorCode.SCHOOL_NOT_FOUND ||
    code === ApiErrorCode.RESOURCE_NOT_FOUND
  ) {
    return 404;
  }

  if (
    code === ApiErrorCode.CONFLICT ||
    code === ApiErrorCode.EMAIL_ALREADY_EXISTS ||
    code === ApiErrorCode.DUPLICATE_ENTRY
  ) {
    return 409;
  }

  return 500;
}

/**
 * Shorthand helpers for common errors
 */
export class ApiErrorFactory {
  static unauthorized(message = 'Not authenticated'): ApiResponse<null> {
    return {
      success: false,
      error: {
        code: ApiErrorCode.UNAUTHORIZED,
        message,
      },
    };
  }

  static sessionExpired(): ApiResponse<null> {
    return {
      success: false,
      error: {
        code: ApiErrorCode.SESSION_EXPIRED,
        message: 'Your session has expired. Please log in again.',
      },
    };
  }

  static forbidden(message = 'You do not have permission to access this resource'): ApiResponse<null> {
    return {
      success: false,
      error: {
        code: ApiErrorCode.FORBIDDEN,
        message,
      },
    };
  }

  static setupIncomplete(): ApiResponse<null> {
    return {
      success: false,
      error: {
        code: ApiErrorCode.SETUP_INCOMPLETE,
        message: 'Please complete school setup before accessing this feature',
      },
    };
  }

  static notFound(resource = 'Resource'): ApiResponse<null> {
    return {
      success: false,
      error: {
        code: ApiErrorCode.NOT_FOUND,
        message: `${resource} not found`,
      },
    };
  }

  static invalidInput(field: string, message?: string): ApiResponse<null> {
    return {
      success: false,
      error: {
        code: ApiErrorCode.INVALID_INPUT,
        message: message || `Invalid value for ${field}`,
        details: { field },
      },
    };
  }

  static serverError(message = 'An unexpected error occurred'): ApiResponse<null> {
    return {
      success: false,
      error: {
        code: ApiErrorCode.INTERNAL_ERROR,
        message,
      },
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shorthand helpers — MANDATORY for all new/updated routes
// ─────────────────────────────────────────────────────────────────────────────

/** Return a success response with message */
export function ok(message: string, data?: any, status = 200) {
  return NextResponse.json({ success: true, message, data }, { status });
}

/** Return an error response with message */
export function fail(message: string, status = 400, error?: any) {
  return NextResponse.json({ success: false, message, error }, { status });
}
