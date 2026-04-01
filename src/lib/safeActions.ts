/**
 * src/lib/safeActions.ts
 * Fire-and-forget wrappers for audit logging and notification creation.
 * These NEVER throw — failures are logged but never crash the caller.
 *
 * Usage in API routes:
 *   import { logAuditSafe, createNotificationSafe } from '@/lib/safeActions';
 *
 *   await logAuditSafe({ schoolId, userId, action: 'CREATED_STAFF', entityType: 'staff', entityId: 1 });
 *   await createNotificationSafe({ schoolId, title: 'Staff Created', message: '...', recipients: [1,2] });
 */
import { logAudit, type AuditEntry } from '@/lib/audit';
import { NotificationService, type NotificationData } from '@/lib/NotificationService';

/**
 * Safe audit logging — never throws.
 */
export async function logAuditSafe(entry: AuditEntry): Promise<void> {
  try {
    await logAudit(entry);
  } catch (err) {
    console.error('[logAuditSafe] Failed:', err);
  }
}

/**
 * Safe notification creation — never throws.
 * Skips if no recipients provided.
 */
export async function createNotificationSafe(data: NotificationData): Promise<void> {
  if (!data.recipients?.length) return;
  try {
    const svc = NotificationService.getInstance();
    await svc.create(data);
  } catch (err) {
    console.error('[createNotificationSafe] Failed:', err);
  }
}
