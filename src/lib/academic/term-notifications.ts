/**
 * Term-aware system notifications.
 * Generates in-app notifications from the canonical term context so admins
 * actually see "no current term", "term ends in N days", "stale active
 * term", etc. in the navbar bell. Deduped per (school, action) per day so
 * it never spams. Called opportunistically (no cron needed) whenever term
 * context is resolved for a logged-in admin.
 */
import { query } from '@/lib/db';
import { resolveTermContext } from '@/lib/academic/term-resolver';
import { triggerNotification } from '@/lib/notificationTrigger';

interface Candidate {
  action: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  entityId?: number | null;
}

/** Already sent today for this school+action? (dedup) */
async function sentToday(schoolId: number, action: string): Promise<boolean> {
  try {
    const r = (await query(
      `SELECT id FROM notifications
        WHERE school_id = ? AND action = ? AND DATE(created_at) = CURDATE()
          AND deleted_at IS NULL LIMIT 1`,
      [schoolId, action],
    )) as any[];
    return r.length > 0;
  } catch { return true; /* on error, don't spam */ }
}

/**
 * Resolve term context and emit any warranted notifications to `userId`.
 * Best-effort, fire-and-forget safe.
 */
export async function maybeNotifyTermContext(
  schoolId: number,
  userId: number | null,
  offsetMin = 180,
): Promise<void> {
  if (!userId) return;
  try {
    const ctx = await resolveTermContext(schoolId, offsetMin);
    const candidates: Candidate[] = [];

    if (ctx.warnings.includes('NO_CURRENT_TERM')) {
      candidates.push({
        action: 'TERM_NONE_CURRENT',
        title: 'No current term configured',
        message: ctx.upcoming
          ? `Today is outside every term. Next: ${ctx.upcoming.name} (starts ${String(ctx.upcoming.start_date).slice(0, 10)}). Set a current term so enrollment, results and reports use the right term.`
          : 'Today is outside every term. Create/activate the current term so enrollment, results and reports use the right term.',
        priority: 'high',
      });
    }
    if (ctx.warnings.includes('STALE_ACTIVE') && ctx.manualActive) {
      candidates.push({
        action: 'TERM_STALE_ACTIVE',
        title: 'A past term is still marked active',
        message: `"${ctx.manualActive.name}" ended ${String(ctx.manualActive.end_date).slice(0, 10)} but is still the active term. Deactivate it or set the current term.`,
        priority: 'high', entityId: ctx.manualActive.id,
      });
    }
    if (ctx.warnings.includes('MULTIPLE_ACTIVE')) {
      candidates.push({
        action: 'TERM_MULTIPLE_ACTIVE',
        title: 'Multiple active terms detected',
        message: 'More than one term is marked active for this school. Only one should be active at a time.',
        priority: 'high',
      });
    }
    // Term ending soon (<= 7 days).
    if (ctx.effective && ctx.progress && ctx.progress.daysRemaining <= 7) {
      candidates.push({
        action: 'TERM_ENDING_SOON',
        title: `${ctx.effective.name} ends in ${ctx.progress.daysRemaining} day(s)`,
        message: `${ctx.effective.name} ends ${String(ctx.effective.end_date).slice(0, 10)}. Prepare end-of-term reports, results and promotions.`,
        priority: 'normal', entityId: ctx.effective.id,
      });
    }

    for (const c of candidates) {
      if (await sentToday(schoolId, c.action)) continue;
      await triggerNotification(
        schoolId,
        { action: c.action, entityType: 'term', entityId: c.entityId ?? null, title: c.title, message: c.message, priority: c.priority, metadata: { source: 'term-resolver' } } as any,
        [userId],
      );
    }
  } catch { /* never disrupt the caller */ }
}
