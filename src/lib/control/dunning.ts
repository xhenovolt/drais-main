/**
 * Control Center — dunning + tenant comms (Phase 14 / E-8 + E-11).
 *
 * Schools were suspended silently on expiry. Now the platform warns them before
 * it happens and tells them when it does — proactively, in-app, to each school's
 * admins. Runs on the EXISTING daily cron (piggybacked; no new cron).
 *
 * `dunningStage` is PURE + unit-tested. The sweep dedups one notice per stage
 * per school per day.
 */
import { query } from '@/lib/db';

export type DunningStage = 'expired' | 'expiring_1' | 'expiring_7' | 'none';

/** PURE: which notice (if any) a school needs given days until its plan ends. */
export function dunningStage(daysUntilEnd: number | null): DunningStage {
  if (daysUntilEnd == null) return 'none';
  if (daysUntilEnd < 0) return 'expired';
  if (daysUntilEnd <= 1) return 'expiring_1';
  if (daysUntilEnd <= 7) return 'expiring_7';
  return 'none';
}

async function schoolAdmins(schoolId: number): Promise<number[]> {
  const rows = (await query(
    `SELECT DISTINCT u.id FROM users u
       JOIN user_roles ur ON ur.user_id = u.id
       JOIN roles r ON r.id = ur.role_id
      WHERE u.school_id = ? AND (u.status IS NULL OR u.status = 'active')
        AND (r.name LIKE '%dmin%' OR r.name LIKE '%eadteacher%' OR r.name LIKE '%irector%')`,
    [schoolId],
  ).catch(() => [])) as Array<{ id: number }>;
  return rows.map((r) => Number(r.id));
}

async function alreadyNoticed(schoolId: number, action: string): Promise<boolean> {
  const rows = (await query(
    `SELECT 1 FROM notifications WHERE school_id = ? AND action = ? AND DATE(created_at) = CURDATE() LIMIT 1`,
    [schoolId, action],
  ).catch(() => [])) as any[];
  return rows.length > 0;
}

/** Notify a school's admins about a billing event (in-app; best-effort). */
export async function notifyTenantBilling(schoolId: number, action: string, title: string, message: string, priority: 'low' | 'medium' | 'high' = 'medium'): Promise<boolean> {
  const admins = await schoolAdmins(schoolId);
  if (!admins.length) return false;
  try {
    const { NotificationService } = await import('@/lib/NotificationService');
    await NotificationService.getInstance().create({
      school_id: schoolId, action, entity_type: 'billing', entity_id: null,
      title, message, priority, channel: 'in_app', recipients: admins, metadata: {},
    } as any);
    return true;
  } catch { return false; }
}

const fmtDate = (d: Date) => d.toISOString().slice(0, 10);

/** Cron entry — send expiry warnings / suspension notices for every school. */
export async function runDunningSweep(): Promise<{ scanned: number; sent: number }> {
  // Only schools with a due-or-approaching expiry (within 7 days or already past).
  const rows = (await query(
    `SELECT id, name, subscription_end_date
       FROM schools
      WHERE deleted_at IS NULL AND subscription_end_date IS NOT NULL
        AND subscription_end_date <= DATE_ADD(CURDATE(), INTERVAL 7 DAY)`,
    [],
  ).catch(() => [])) as Array<{ id: number; name: string; subscription_end_date: string }>;

  let sent = 0;
  const today = new Date(fmtDate(new Date()) + 'T00:00:00Z').getTime();
  for (const s of rows) {
    try {
      const end = new Date(String(s.subscription_end_date).slice(0, 10) + 'T00:00:00Z').getTime();
      const days = Math.round((end - today) / 86_400_000);
      const stage = dunningStage(days);
      if (stage === 'none') continue;
      const action = `billing_${stage}`;
      if (await alreadyNoticed(s.id, action)) continue;

      const endStr = String(s.subscription_end_date).slice(0, 10);
      const [title, message, priority] =
        stage === 'expired'
          ? ['Subscription expired — access suspended', `Your DRAIS subscription expired on ${endStr}. Access is now suspended. Please renew to restore it.`, 'high' as const]
          : stage === 'expiring_1'
            ? ['Subscription expires tomorrow', `Your DRAIS subscription expires on ${endStr}. Renew now to avoid interruption.`, 'high' as const]
            : ['Subscription expiring soon', `Your DRAIS subscription expires on ${endStr} (in ${days} days). Please arrange renewal.`, 'medium' as const];

      if (await notifyTenantBilling(s.id, action, title, message, priority)) sent++;
    } catch { /* per-school best-effort */ }
  }
  return { scanned: rows.length, sent };
}
