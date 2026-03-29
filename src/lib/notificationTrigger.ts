/**
 * src/lib/notificationTrigger.ts
 * Notification trigger utilities for staff events
 * Automatically creates notifications for key actions
 *
 * Usage:
 *   import { triggerStaffNotification } from '@/lib/notificationTrigger';
 *
 *   await triggerStaffNotification('STAFF_CREATED', {
 *     staffId, staffName, userId
 *   }, recipientUserIds);
 */
import { NotificationService } from '@/lib/NotificationService';

export const NOTIFICATION_TYPES = {
  STAFF: {
    CREATED: 'STAFF_CREATED',
    UPDATED: 'STAFF_UPDATED',
    DELETED: 'STAFF_DELETED',
    ACCOUNT_CREATED: 'STAFF_ACCOUNT_CREATED',
    ACCOUNT_DISABLED: 'STAFF_ACCOUNT_DISABLED'
  },
  USER: {
    LOGIN_FAILED: 'USER_LOGIN_FAILED',
    SESSION_EXPIRED: 'USER_SESSION_EXPIRED'
  },
  ERROR: {
    CRITICAL_ERROR: 'CRITICAL_ERROR',
    OPERATION_FAILED: 'OPERATION_FAILED'
  }
} as const;

export interface NotificationPayload {
  action: string;
  entityType?: string;
  entityId?: number;
  title: string;
  message: string;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  metadata?: Record<string, any>;
}

/**
 * Send success notification when staff is created
 */
export async function notifyStaffCreated(
  schoolId: number,
  staffData: {
    staffId: number;
    staffName: string;
    position: string;
    userId?: number;
  },
  recipientUserIds: number[]
): Promise<void> {
  if (recipientUserIds.length === 0) return;

  const notificationService = NotificationService.getInstance();

  const createdUserAccount = staffData.userId ? 'with login account' : 'without account';

  try {
    await notificationService.create({
      school_id: schoolId,
      action: NOTIFICATION_TYPES.STAFF.CREATED,
      entity_type: 'staff',
      entity_id: staffData.staffId,
      title: `✅ New Staff Member Added`,
      message: `${staffData.staffName} has been added as ${staffData.position} (${createdUserAccount}).`,
      priority: 'normal',
      channel: 'in_app',
      recipients: recipientUserIds,
      metadata: {
        staffId: staffData.staffId,
        staffName: staffData.staffName,
        position: staffData.position,
        hasAccount: !!staffData.userId
      }
    });
  } catch (error) {
    console.error('Failed to send staff creation notification:', error);
    // Don't throw - notifications are non-critical
  }
}

/**
 * Send error notification when critical operation fails
 */
export async function notifyErrorOccurred(
  schoolId: number,
  errorData: {
    operation: string;
    errorMessage: string;
    severity: 'warning' | 'error' | 'critical';
    context?: Record<string, any>;
  },
  recipientUserIds: number[]
): Promise<void> {
  if (recipientUserIds.length === 0) return;

  const notificationService = NotificationService.getInstance();

  const priorityMap = {
    warning: 'high' as const,
    error: 'high' as const,
    critical: 'critical' as const
  };

  const iconMap = {
    warning: '⚠️',
    error: '❌',
    critical: '🚨'
  };

  try {
    await notificationService.create({
      school_id: schoolId,
      action: NOTIFICATION_TYPES.ERROR.OPERATION_FAILED,
      entity_type: 'system',
      title: `${iconMap[errorData.severity]} ${errorData.operation} Failed`,
      message: errorData.errorMessage,
      priority: priorityMap[errorData.severity],
      channel: 'in_app',
      recipients: recipientUserIds,
      metadata: {
        operation: errorData.operation,
        severity: errorData.severity,
        context: errorData.context
      }
    });
  } catch (error) {
    console.error('Failed to send error notification:', error);
    // Don't throw - notifications are non-critical
  }
}

/**
 * Send notification for staff role assignment
 */
export async function notifyRoleAssigned(
  schoolId: number,
  staffData: {
    staffId: number;
    staffName: string;
    roleName: string;
  },
  recipientUserIds: number[]
): Promise<void> {
  if (recipientUserIds.length === 0) return;

  const notificationService = NotificationService.getInstance();

  try {
    await notificationService.create({
      school_id: schoolId,
      action: NOTIFICATION_TYPES.STAFF.UPDATED,
      entity_type: 'staff',
      entity_id: staffData.staffId,
      title: `👤 Role Assigned`,
      message: `${staffData.staffName} has been assigned the ${staffData.roleName} role.`,
      priority: 'normal',
      channel: 'in_app',
      recipients: recipientUserIds,
      metadata: {
        staffId: staffData.staffId,
        staffName: staffData.staffName,
        roleName: staffData.roleName
      }
    });
  } catch (error) {
    console.error('Failed to send role assignment notification:', error);
  }
}

/**
 * Generic notification trigger for custom events
 */
export async function triggerNotification(
  schoolId: number,
  payload: NotificationPayload,
  recipientUserIds: number[]
): Promise<void> {
  if (recipientUserIds.length === 0) return;

  const notificationService = NotificationService.getInstance();

  try {
    await notificationService.create({
      school_id: schoolId,
      action: payload.action,
      entity_type: payload.entityType,
      entity_id: payload.entityId,
      title: payload.title,
      message: payload.message,
      priority: payload.priority || 'normal',
      channel: 'in_app',
      recipients: recipientUserIds,
      metadata: payload.metadata
    });
  } catch (error) {
    console.error('Failed to send notification:', error);
  }
}
