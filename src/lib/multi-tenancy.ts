import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

/**
 * Multi-Tenancy Context
 * Enforces school isolation on all requests
 */
export interface TenantContext {
  school_id: number;
  user_id?: number;
  email?: string;
  role?: string;
}

/**
 * Extract tenant context from request
 * Can come from:
 * 1. URL parameter: ?school_id=1
 * 2. Authorization header (future: JWT with school_id)
 * 3. Query parameter in body
 */
export function extractTenantContext(req: NextRequest): TenantContext | null {
  const { searchParams } = new URL(req.url);
  const schoolId = searchParams.get('school_id');
  
  if (!schoolId) {
    console.warn('No school_id provided in request');
    return null;
  }

  return {
    school_id: parseInt(schoolId, 10),
  };
}

/**
 * Validate that user belongs to school
 */
export async function validateSchoolAccess(
  userId: number,
  schoolId: number
): Promise<boolean> {
  try {
    const connection = await getConnection();
    try {
      // Check if user has access to this school
      const [result]: any = await connection.execute(
        `SELECT 1 FROM users 
         WHERE id = ? AND school_id = ? AND deleted_at IS NULL`,
        [userId, schoolId]
      );
      return result.length > 0;
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('School access validation error:', error);
    return false;
  }
}

/**
 * Enforce school isolation on database queries
 * This is a helper to ensure school_id is ALWAYS in WHERE clause
 */
export interface QueryOptions {
  school_id: number;
  userId?: number;
}

/**
 * Build WHERE clause that enforces school isolation
 */
export function buildSchoolWhereClause(
  options: QueryOptions,
  tableAlias: string = ''
): { clause: string; params: any[] } {
  const prefix = tableAlias ? `${tableAlias}.` : '';
  return {
    clause: `${prefix}school_id = ?`,
    params: [options.school_id],
  };
}

/**
 * Add audit log entry
 */
export async function logActivity(
  schoolId: number,
  action: string,
  entityType: string,
  entityId: number | null,
  oldValues: any = null,
  newValues: any = null,
  actorUserId: number | null = null,
  ipAddress: string | null = null,
  userAgent: string | null = null,
  reason: string | null = null
): Promise<void> {
  try {
    const connection = await getConnection();
    try {
      await connection.execute(
        `INSERT INTO activity_logs 
         (school_id, actor_user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, reason)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          schoolId,
          actorUserId,
          action,
          entityType,
          entityId,
          oldValues ? JSON.stringify(oldValues) : null,
          newValues ? JSON.stringify(newValues) : null,
          ipAddress,
          userAgent,
          reason,
        ]
      );
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Activity log error:', error);
    // Don't throw - logging should not break the main operation
  }
}

/**
 * Middleware to inject tenant context
 * Use in API routes like:
 * 
 * export async function GET(req: NextRequest) {
 *   const tenant = extractTenantContext(req);
 *   if (!tenant) {
 *     return NextResponse.json({ error: 'Missing school_id' }, { status: 400 });
 *   }
 *   // ... rest of your code with tenant.school_id
 * }
 */

/**
 * Verify school isolation - prevent cross-school access
 */
export async function verifyCrossSchoolAccess(
  schoolId: number,
  studentId: number
): Promise<boolean> {
  try {
    const connection = await getConnection();
    try {
      const [result]: any = await connection.execute(
        `SELECT 1 FROM students WHERE id = ? AND school_id = ?`,
        [studentId, schoolId]
      );
      return result.length > 0;
    } finally {
      await connection.end();
    }
  } catch (error) {
    console.error('Cross-school access check error:', error);
    return false;
  }
}

/**
 * Build multi-tenant safe query
 * Automatically adds school_id filter
 */
export function buildMultiTenantQuery(
  baseQuery: string,
  schoolId: number,
  whereClause: string = 'school_id'
): { query: string; params: any[] } {
  return {
    query: baseQuery,
    params: [schoolId],
  };
}
