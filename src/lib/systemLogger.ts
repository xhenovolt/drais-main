/**
 * src/lib/systemLogger.ts
 * Central system logging for errors, warnings, and critical events
 * Complements audit logging by capturing technical issues
 *
 * Usage:
 *   import { logSystemError, logSystemEvent } from '@/lib/systemLogger';
 *
 *   await logSystemError({
 *     source: '/api/staff/add',
 *     message: 'Database constraint failed',
 *     statusCode: 500,
 *     context: { query: '...', error: dbError },
 *     userId: session.userId
 *   });
 */
import { query } from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export enum LogLevel {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

export interface SystemLogEntry {
  schoolId?: number | null;
  level: LogLevel;
  source: string; // API route, service name, function name
  message: string;
  context?: Record<string, any>;
  statusCode?: number;
  userId?: number | null;
  requestId?: string;
}

/**
 * Write system log to database
 * Does NOT throw on failure - always returns success/failure status
 */
export async function logSystemEvent(entry: SystemLogEntry): Promise<boolean> {
  const requestId = entry.requestId || uuidv4();
  
  try {
    const contextJson = entry.context ? JSON.stringify(entry.context) : null;
    
    await query(`
      INSERT INTO system_logs (
        school_id, level, source, message, context, 
        status_code, user_id, request_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
    `, [
      entry.schoolId || null,
      entry.level,
      entry.source,
      entry.message,
      contextJson,
      entry.statusCode || null,
      entry.userId || null,
      requestId
    ]);

    return true;
  } catch (err) {
    // Log to console as fallback if DB fails
    console.error(`[${entry.level}] ${entry.source}: ${entry.message}`, entry.context || {});
    return false;
  }
}

/**
 * Convenience function for error logging
 */
export async function logSystemError(entry: Omit<SystemLogEntry, 'level'>): Promise<boolean> {
  return logSystemEvent({ ...entry, level: LogLevel.ERROR });
}

/**
 * Convenience function for critical errors
 */
export async function logSystemCritical(entry: Omit<SystemLogEntry, 'level'>): Promise<boolean> {
  return logSystemEvent({ ...entry, level: LogLevel.CRITICAL });
}

/**
 * Convenience function for warnings
 */
export async function logSystemWarning(entry: Omit<SystemLogEntry, 'level'>): Promise<boolean> {
  return logSystemEvent({ ...entry, level: LogLevel.WARNING });
}

/**
 * Convenience function for info
 */
export async function logSystemInfo(entry: Omit<SystemLogEntry, 'level'>): Promise<boolean> {
  return logSystemEvent({ ...entry, level: LogLevel.INFO });
}

/**
 * Get recent system logs (for dashboards/debugging)
 */
export async function getSystemLogs(
  filters?: {
    level?: LogLevel;
    schoolId?: number;
    limit?: number;
    offset?: number;
  }
): Promise<any[]> {
  try {
    let sql = 'SELECT * FROM system_logs WHERE 1=1';
    const params: any[] = [];

    if (filters?.schoolId) {
      sql += ' AND school_id = ?';
      params.push(filters.schoolId);
    }

    if (filters?.level) {
      sql += ' AND level = ?';
      params.push(filters.level);
    }

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(filters?.limit || 100);
    params.push(filters?.offset || 0);

    const results = await query(sql, params);
    return results;
  } catch (err) {
    console.error('Failed to fetch system logs:', err);
    return [];
  }
}
