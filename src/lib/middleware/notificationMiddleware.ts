import { NextRequest } from 'next/server';
import { NotificationService } from '@/lib/NotificationService';
import { getConnection } from '@/lib/db';

export interface NotificationContext {
  action?: string;
  entity_type?: string;
  entity_id?: number;
  actor_user_id?: number;
  school_id?: number;
  recipients?: number[];
  metadata?: Record<string, any>;
  title?: string;
  message?: string;
}

export class NotificationMiddleware {
  private static notificationService = NotificationService.getInstance();

  /**
   * Auto-log notification from API response
   */
  static async notifyOnAction(
    req: NextRequest,
    context: NotificationContext,
    responseData?: any
  ): Promise<void> {
    try {
      // Skip if no recipients specified
      if (!context.recipients || context.recipients.length === 0) {
        return;
      }

      // Add audit log entry first
      await this.createAuditLog({
        actor_user_id: context.actor_user_id,
        action: context.action || 'unknown_action',
        entity_type: context.entity_type || 'unknown',
        entity_id: context.entity_id,
        changes_json: JSON.stringify({
          ...context.metadata,
          response_data: responseData
        })
      });

      // Try template-based notification first
      if (context.action) {
        await this.notificationService.autoLog(req, {
          ...context,
          action: context.action,
        });
      }

      // Fallback to direct notification if title/message provided
      if (context.title && context.message && !context.action) {
        await this.notificationService.create({
          school_id: context.school_id,
          actor_user_id: context.actor_user_id,
          action: 'custom_action',
          entity_type: context.entity_type,
          entity_id: context.entity_id,
          title: context.title,
          message: context.message,
          metadata: context.metadata,
          recipients: context.recipients
        });
      }
    } catch (error) {
      // Log error but don't fail the main request
      console.error('NotificationMiddleware.notifyOnAction error:', error);
    }
  }

  /**
   * Get admin recipients for a school
   */
  static async getAdminRecipients(schoolId: number): Promise<number[]> {
    let connection;
    
    try {
      connection = await getConnection();
      
      const [admins] = await connection.execute(`
        SELECT DISTINCT u.id
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id AND ur.is_active = TRUE
        JOIN roles r ON ur.role_id = r.id AND r.is_active = TRUE
        WHERE u.school_id = ?
          AND u.status = 'active'
          AND u.deleted_at IS NULL
          AND (r.name LIKE '%admin%' OR r.name LIKE '%head%' OR r.is_super_admin = TRUE)
      `, [schoolId]);

      return Array.isArray(admins) ? admins.map((admin: any) => admin.id) : [];
    } catch (error) {
      console.error('Failed to get admin recipients:', error);
      return [];
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Get teacher recipients for a class
   */
  static async getTeacherRecipients(classId: number): Promise<number[]> {
    let connection;
    
    try {
      connection = await getConnection();
      
      const [teachers] = await connection.execute(`
        SELECT DISTINCT u.id
        FROM users u
        JOIN staff s ON u.id IN (
          SELECT sau.user_id FROM staff_user_accounts sau WHERE sau.staff_id = s.id
        )
        LEFT JOIN classes c ON c.head_teacher_id = s.id
        LEFT JOIN class_subjects cs ON cs.teacher_id = s.id
        WHERE (c.id = ? OR cs.class_id = ?)
          AND u.status = 'active'
          AND s.status = 'active'
      `, [classId, classId]);

      return Array.isArray(teachers) ? teachers.map((teacher: any) => teacher.id) : [];
    } catch (error) {
      console.error('Failed to get teacher recipients:', error);
      return [];
    } finally {
      if (connection) await connection.end();
    }
  }

  private static async createAuditLog(data: {
    actor_user_id?: number;
    action: string;
    entity_type: string;
    entity_id?: number;
    changes_json: string;
  }): Promise<void> {
    let connection;
    
    try {
      connection = await getConnection();
      
      await connection.execute(`
        INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, changes_json)
        VALUES (?, ?, ?, ?, ?)
      `, [
        data.actor_user_id,
        data.action,
        data.entity_type,
        data.entity_id,
        data.changes_json
      ]);
    } catch (error) {
      console.error('Failed to create audit log:', error);
    } finally {
      if (connection) await connection.end();
    }
  }
}

export default NotificationMiddleware;
