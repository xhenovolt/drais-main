/**
 * Delivery-status alert wording and mode rules — PURE (no DB, no network) so it is unit-testable.
 * The sending side lives in ./delivery-alerts.ts.
 */
import { maskPhone } from '@/lib/notifications/outbox-query';

export type DeliveryAlertMode = 'off' | 'failed' | 'all';
export const DELIVERY_ALERT_MODES: DeliveryAlertMode[] = ['off', 'failed', 'all'];
/** Most alert SMS one school can be sent in any 60 minutes. */
export const DELIVERY_ALERT_HOURLY_CAP = 20;

export interface DeliveryAlertInput {
  schoolId: number;
  state: 'delivered' | 'failed';
  recipientName?: string | null;
  recipientPhone?: string | null;
  learnerName?: string | null;
  reason?: string | null;
  outboxId?: number | null;
  dispatchLogId?: number | null;
}

/** PURE: should this status be texted under this mode? */
export function shouldAlert(mode: string | null | undefined, state: 'delivered' | 'failed'): boolean {
  if (mode === 'all') return true;
  if (mode === 'off') return false;
  return state === 'failed'; // 'failed' and anything unrecognised
}

/** PURE: the alert text. One SMS segment in the normal case (kept under 160 characters). */
export function buildAlertBody(a: DeliveryAlertInput, prefix?: string | null): string {
  const who = a.learnerName
    ? `${a.learnerName}'s guardian${a.recipientName ? ` ${a.recipientName}` : ''}`
    : (a.recipientName || 'recipient');
  const phone = a.recipientPhone ? ` (${maskPhone(a.recipientPhone)})` : '';
  const head = prefix && prefix.trim() ? `${prefix.trim()} ` : '';
  const text = a.state === 'delivered'
    ? `${head}SMS DELIVERED to ${who}${phone}.`
    : `${head}SMS NOT DELIVERED to ${who}${phone}.${a.reason ? ` Reason: ${a.reason}` : ''}`;
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}
