import { query } from '@/lib/db';

export type PlatformEventType =
  | 'school.created'
  | 'school.updated'
  | 'school.suspended'
  | 'school.reactivated'
  | 'school.deleted'
  | 'subscription.changed'
  | 'subscription.expiring'
  | 'subscription.expired'
  | 'payment.received'
  | 'sms.balance.low'
  | 'learner.limit.exceeded'
  | 'tenant.health.degraded';

export interface PlatformEvent<T = unknown> {
  id?:         number;
  eventType:   PlatformEventType;
  schoolId:    number | null;
  payload:     T;
  emittedAt?:  Date;
}

/** Persist an event and enqueue webhook deliveries for matching subscriptions. */
export async function emitPlatformEvent(evt: Omit<PlatformEvent, 'id' | 'emittedAt'>): Promise<number> {
  const res: any = await query(
    `INSERT INTO platform_events (event_type, school_id, payload) VALUES (?, ?, ?)`,
    [evt.eventType, evt.schoolId, JSON.stringify(evt.payload ?? {})],
  );
  const eventId = res?.insertId as number;

  const subs = (await query(
    `SELECT id, event_types FROM webhook_subscriptions WHERE is_active = TRUE`,
  )) as Array<{ id: number; event_types: string | string[] }>;

  for (const s of subs) {
    const types = Array.isArray(s.event_types) ? s.event_types : JSON.parse(s.event_types);
    const match = types.includes('*') || types.includes(evt.eventType);
    if (!match) continue;
    await query(
      `INSERT INTO webhook_deliveries
         (subscription_id, event_id, event_type, payload, status, next_retry_at)
       VALUES (?, ?, ?, ?, 'pending', NOW())`,
      [s.id, eventId, evt.eventType, JSON.stringify(evt.payload ?? {})],
    );
  }

  return eventId;
}
