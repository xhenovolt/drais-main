import mysql from 'mysql2/promise';
import { getConnection } from '@/lib/db';
import { SocketService } from '@/lib/SocketService';

export interface NotificationData {
  school_id?: number | null;
  actor_user_id?: number | null;
  action: string;
  entity_type?: string | null;
  entity_id?: number | null;
  title: string;
  message: string;
  metadata?: Record<string, any> | null;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  channel?: string;
  recipients: number[];
}

export interface NotificationTemplate {
  code: string;
  title_template: string;
  message_template: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  channel?: string;
}

export class NotificationService {
  private static instance: NotificationService;
  private socketService: SocketService;

  constructor() {
    this.socketService = SocketService.getInstance();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Create a notification and distribute to recipients
   */
  async create(data: NotificationData): Promise<{ notification_id: number; delivered: number }> {
    // Validate critical fields before insert
    if (!data.action?.trim()) {
      throw new Error('NotificationService.create: action is required');
    }
    if (!data.title?.trim()) {
      throw new Error('NotificationService.create: title is required');
    }
    if (!data.message?.trim()) {
      throw new Error('NotificationService.create: message is required');
    }
    if (!Array.isArray(data.recipients) || data.recipients.length === 0) {
      throw new Error('NotificationService.create: recipients array is required and must not be empty');
    }

    let connection;
    
    try {
      connection = await getConnection();
      await connection.beginTransaction();

      // Insert notification — coerce undefined → null to prevent bind param errors
      const [notificationResult] = await connection.execute(`
        INSERT INTO notifications (
          school_id, actor_user_id, action, entity_type, entity_id,
          title, message, metadata, priority, channel
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.school_id      ?? null,
        data.actor_user_id  ?? null,
        data.action,
        data.entity_type    ?? null,
        data.entity_id      ?? null,
        data.title,
        data.message,
        JSON.stringify(data.metadata || {}),
        data.priority || 'normal',
        data.channel  || 'in_app',
      ]);

      const notificationId = notificationResult.insertId;

      // Create user_notifications entries
      let deliveredCount = 0;
      for (const userId of data.recipients) {
        try {
          await connection.execute(`
            INSERT INTO user_notifications (notification_id, user_id, school_id, channel)
            VALUES (?, ?, ?, ?)
          `, [notificationId, userId, data.school_id ?? null, data.channel || 'in_app']);
          deliveredCount++;

          // Emit real-time notification for in_app channel
          if (data.channel === 'in_app' || !data.channel) {
            this.socketService.emitToUser(userId, 'notification:new', {
              id: notificationId,
              title: data.title,
              message: data.message,
              priority: data.priority || 'normal',
              created_at: new Date().toISOString(),
              metadata: data.metadata
            });
          }
        } catch (error) {
          console.warn(`Failed to create user_notification for user ${userId}:`, error);
        }
      }

      // Queue for non-in_app channels
      if (data.channel && data.channel !== 'in_app') {
        await this.enqueueForDelivery(connection, notificationId, data.recipients, data.channel);
      }

      await connection.commit();

      console.log(`Notification ${notificationId} created for ${deliveredCount} recipients`);
      
      return { notification_id: notificationId, delivered: deliveredCount };
    } catch (error) {
      if (connection) await connection.rollback();
      console.error('NotificationService.create error:', error);
      throw error;
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Create notification from template.
   * Returns null (and logs a warning) if the template does not exist —
   * the caller must NOT crash on a missing template.
   */
  async createFromTemplate(
    templateCode: string, 
    variables: Record<string, unknown>, 
    recipients: number[], 
    overrides: Partial<NotificationData> = {}
  ): Promise<{ notification_id: number; delivered: number } | null> {
    let connection;
    
    try {
      connection = await getConnection();
      
      // Get template
      const [templates] = await connection.execute(`
        SELECT title_template, message_template, default_channel, priority
        FROM notification_templates 
        WHERE code = ? AND (school_id = ? OR school_id IS NULL) AND is_active = 1
        ORDER BY school_id DESC LIMIT 1
      `, [templateCode, overrides.school_id || null]);

      if (!Array.isArray(templates) || templates.length === 0) {
        // Template missing — warn and return null.  Never throw here so callers
        // never crash due to a missing optional template.
        console.warn(`[NotificationService] Template not found: "${templateCode}". ` +
          'Run migration 020_fix_enrollments_complete.sql to seed system templates.');
        return null;
      }

      const template = templates[0];
      
      // Replace placeholders
      const title = this.replacePlaceholders(template.title_template, variables);
      const message = this.replacePlaceholders(template.message_template, variables);

      return await this.create({
        title,
        message,
        priority: template.priority,
        channel: template.default_channel,
        recipients,
        ...overrides
      });
    } catch (error) {
      console.error('NotificationService.createFromTemplate error:', error);
      // Do not re-throw — notification failures must never crash main requests
      return null;
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Mark notifications as read
   */
  async markAsRead(notificationIds: number[], userId: number): Promise<void> {
    let connection;
    
    try {
      connection = await getConnection();
      
      if (notificationIds.length === 0) return;
      
      const placeholders = notificationIds.map(() => '?').join(',');
      await connection.execute(`
        UPDATE user_notifications 
        SET is_read = 1, read_at = CURRENT_TIMESTAMP
        WHERE notification_id IN (${placeholders}) AND user_id = ? AND is_read = 0
      `, [...notificationIds, userId]);

      // Emit update to user
      this.socketService.emitToUser(userId, 'notification:updated', {
        ids: notificationIds,
        action: 'marked_read'
      });
    } catch (error) {
      console.error('NotificationService.markAsRead error:', error);
      throw error;
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Archive notifications
   */
  async archive(notificationIds: number[], userId: number): Promise<void> {
    let connection;
    
    try {
      connection = await getConnection();
      
      if (notificationIds.length === 0) return;
      
      const placeholders = notificationIds.map(() => '?').join(',');
      await connection.execute(`
        UPDATE user_notifications 
        SET is_archived = 1, archived_at = CURRENT_TIMESTAMP
        WHERE notification_id IN (${placeholders}) AND user_id = ? AND is_archived = 0
      `, [...notificationIds, userId]);

      // Emit update to user
      this.socketService.emitToUser(userId, 'notification:updated', {
        ids: notificationIds,
        action: 'archived'
      });
    } catch (error) {
      console.error('NotificationService.archive error:', error);
      throw error;
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Get unread count for user
   */
  async getUnreadCount(userId: number, schoolId?: number): Promise<number> {
    let connection;
    
    try {
      connection = await getConnection();
      
      let sql = `
        SELECT COUNT(*) as count
        FROM user_notifications un
        WHERE un.user_id = ? AND un.is_read = 0 AND un.is_archived = 0
      `;
      const params = [userId];
      
      if (schoolId) {
        sql += ' AND un.school_id = ?';
        params.push(schoolId);
      }
      
      const [rows] = await connection.execute(sql, params);
      return Array.isArray(rows) && rows.length > 0 ? rows[0].count : 0;
    } catch (error) {
      console.error('NotificationService.getUnreadCount error:', error);
      return 0;
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * List notifications for user with pagination
   */
  async list(
    userId: number, 
    options: {
      cursor?: string;
      limit?: number;
      filter?: 'unread' | 'archived' | 'all';
      schoolId?: number;
    } = {}
  ) {
    let connection;
    
    try {
      connection = await getConnection();
      
      const { cursor, limit = 25, filter = 'all', schoolId } = options;
      
      let sql = `
        SELECT 
          n.id,
          n.action,
          n.entity_type,
          n.entity_id,
          n.title,
          n.message,
          n.metadata,
          n.priority,
          n.created_at,
          un.is_read,
          un.is_archived,
          un.read_at
        FROM notifications n
        JOIN user_notifications un ON n.id = un.notification_id
        WHERE un.user_id = ? AND n.deleted_at IS NULL
      `;
      
      const params = [userId];
      
      if (schoolId) {
        sql += ' AND un.school_id = ?';
        params.push(schoolId);
      }
      
      if (filter === 'unread') {
        sql += ' AND un.is_read = 0 AND un.is_archived = 0';
      } else if (filter === 'archived') {
        sql += ' AND un.is_archived = 1';
      } else if (filter === 'all') {
        sql += ' AND un.is_archived = 0';
      }
      
      if (cursor) {
        sql += ' AND n.created_at < ?';
        params.push(cursor);
      }
      
      sql += ' ORDER BY n.created_at DESC LIMIT ?';
      params.push(limit + 1); // Get one extra to determine if there are more
      
      const [rows] = await connection.execute(sql, params);
      const notifications = Array.isArray(rows) ? rows : [];
      
      const hasMore = notifications.length > limit;
      if (hasMore) notifications.pop(); // Remove the extra record
      
      const nextCursor = hasMore && notifications.length > 0 
        ? notifications[notifications.length - 1].created_at 
        : null;
      
      return {
        notifications: notifications.map(n => ({
          ...n,
          metadata: typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata
        })),
        hasMore,
        nextCursor
      };
    } catch (error) {
      console.error('NotificationService.list error:', error);
      throw error;
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Auto-create notification from audit context
   */
  async autoLog(req: Request, context: {
    action: string;
    entity_type?: string;
    entity_id?: number;
    actor_user_id?: number;
    school_id?: number;
    recipients?: number[];
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    try {
      // Try to create from template first
      if (context.recipients && context.recipients.length > 0) {
        const variables = {
          entity_type: context.entity_type,
          entity_id: context.entity_id,
          ...context.metadata
        };

        await this.createFromTemplate(
          context.action,
          variables,
          context.recipients,
          {
            school_id: context.school_id,
            actor_user_id: context.actor_user_id,
            action: context.action,
            entity_type: context.entity_type,
            entity_id: context.entity_id,
            metadata: context.metadata
          }
        );
      }
    } catch (error) {
      // createFromTemplate already returns null on missing template, so this
      // catch handles unexpected errors only.
      console.debug(`Auto-log skipped for action ${context.action}:`,
        error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Process notification queue (for worker)
   */
  async processQueue(batchSize: number = 50): Promise<{ processed: number; failed: number }> {
    let connection;
    
    try {
      connection = await getConnection();
      
      // Get pending notifications
      const [pending] = await connection.execute(`
        SELECT id, notification_id, recipient_user_id, channel, attempts, payload
        FROM notification_queue
        WHERE status = 'pending' 
          AND (next_attempt_at IS NULL OR next_attempt_at <= CURRENT_TIMESTAMP)
          AND attempts < max_attempts
        ORDER BY created_at ASC
        LIMIT ?
      `, [batchSize]);

      let processed = 0;
      let failed = 0;

      for (const item of (Array.isArray(pending) ? pending : [])) {
        try {
          // Here you would implement actual delivery logic for email, SMS, etc.
          const success = await this.deliverNotification(item);
          
          if (success) {
            await connection.execute(`
              UPDATE notification_queue 
              SET status = 'sent', last_attempt_at = CURRENT_TIMESTAMP
              WHERE id = ?
            `, [item.id]);
            processed++;
          } else {
            throw new Error('Delivery failed');
          }
        } catch (error) {
          failed++;
          const nextAttempt = new Date();
          nextAttempt.setMinutes(nextAttempt.getMinutes() + Math.pow(2, item.attempts) * 5); // Exponential backoff
          
          await connection.execute(`
            UPDATE notification_queue 
            SET attempts = attempts + 1, 
                last_attempt_at = CURRENT_TIMESTAMP,
                next_attempt_at = ?,
                status = CASE WHEN attempts + 1 >= max_attempts THEN 'failed' ELSE 'pending' END,
                error_message = ?
            WHERE id = ?
          `, [nextAttempt, error.message, item.id]);
        }
      }

      return { processed, failed };
    } catch (error) {
      console.error('NotificationService.processQueue error:', error);
      throw error;
    } finally {
      if (connection) await connection.end();
    }
  }

  // Helper methods
  private async enqueueForDelivery(connection: mysql.Connection | mysql.PoolConnection, notificationId: number, recipients: number[], channel: string): Promise<void> {
    for (const userId of recipients) {
      await connection.execute(`
        INSERT INTO notification_queue (notification_id, recipient_user_id, channel, next_attempt_at)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      `, [notificationId, userId, channel]);
    }
  }

  private replacePlaceholders(template: string, variables: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] !== undefined ? String(variables[key]) : match;
    });
  }

  private async deliverNotification(queueItem: { channel: string; [key: string]: unknown }): Promise<boolean> {
    // Implement actual delivery logic here based on channel
    switch (queueItem.channel) {
      case 'email':
        // Implement email delivery
        return true;
      case 'sms':
        // Implement SMS delivery
        return true;
      case 'webhook':
        // Implement webhook delivery
        return true;
      default:
        throw new Error(`Unsupported channel: ${queueItem.channel}`);
    }
  }
}

export default NotificationService;
