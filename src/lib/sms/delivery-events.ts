/**
 * SMS delivery events — what the PROVIDER reported about a message after accepting it.
 *
 * One row per (message, state): 'sent' (handed to the mobile network), 'delivered' (reached the
 * phone) or 'failed' (rejected / undeliverable). Written only by the signature-verified delivery
 * webhooks, never by the browser.
 *
 * This table is also the real-time feed: it lives in the database, so a report received by one
 * server instance is seen by every open staff screen (the live-scan stream tails it), which an
 * in-process event bus cannot do on serverless.
 */
import { query } from '@/lib/db';

export type DeliveryEventState = 'sent' | 'delivered' | 'failed';

export interface DeliveryEventInput {
  schoolId: number | null;
  provider: string | null;
  providerMessageId: string;
  state: DeliveryEventState;
  providerStatus?: string | null;
  reason?: string | null;
  network?: string | null;
  recipientPhone?: string | null;
  recipientName?: string | null;
  learnerName?: string | null;
  outboxId?: number | null;
  dispatchLogId?: number | null;
}

let ready: Promise<void> | null = null;
export function ensureDeliveryEventsTable(): Promise<void> {
  if (ready) return ready;
  ready = query(
    `CREATE TABLE IF NOT EXISTS sms_delivery_events (
       id                  BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
       school_id           BIGINT DEFAULT NULL,
       provider            VARCHAR(40) DEFAULT NULL,
       provider_message_id VARCHAR(120) NOT NULL,
       state               VARCHAR(20) NOT NULL,
       provider_status     VARCHAR(60) DEFAULT NULL,
       reason              VARCHAR(255) DEFAULT NULL,
       network             VARCHAR(60) DEFAULT NULL,
       recipient_phone     VARCHAR(40) DEFAULT NULL,
       recipient_name      VARCHAR(150) DEFAULT NULL,
       learner_name        VARCHAR(150) DEFAULT NULL,
       outbox_id           BIGINT DEFAULT NULL,
       dispatch_log_id     BIGINT DEFAULT NULL,
       created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
       UNIQUE KEY uk_sde_message_state (provider_message_id, state),
       KEY idx_sde_school (school_id, id),
       KEY idx_sde_outbox (outbox_id)
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, [],
  ).then(() => undefined).catch(() => { ready = null; });
  return ready;
}

/** Record a provider report. Idempotent: a repeated (message, state) is ignored. Returns true if new. */
export async function recordDeliveryEvent(e: DeliveryEventInput): Promise<boolean> {
  await ensureDeliveryEventsTable();
  const cut = (v: string | null | undefined, n: number) => (v == null || v === '' ? null : String(v).slice(0, n));
  const r = (await query(
    `INSERT IGNORE INTO sms_delivery_events
       (school_id, provider, provider_message_id, state, provider_status, reason, network,
        recipient_phone, recipient_name, learner_name, outbox_id, dispatch_log_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [e.schoolId ?? null, cut(e.provider, 40), e.providerMessageId.slice(0, 120), e.state, cut(e.providerStatus, 60), cut(e.reason, 255),
      cut(e.network, 60), cut(e.recipientPhone, 40), cut(e.recipientName, 150), cut(e.learnerName, 150), e.outboxId ?? null, e.dispatchLogId ?? null],
  ).catch(() => null)) as { affectedRows?: number } | null;
  return (r?.affectedRows ?? 0) > 0;
}

export interface DeliveryEventRow {
  id: number;
  state: DeliveryEventState;
  provider: string | null;
  provider_message_id: string;
  reason: string | null;
  network: string | null;
  recipient_phone: string | null;
  recipient_name: string | null;
  learner_name: string | null;
  outbox_id: number | null;
  dispatch_log_id: number | null;
  created_at: string;
}

const COLS = `id, state, provider, provider_message_id, reason, network, recipient_phone, recipient_name, learner_name, outbox_id, dispatch_log_id, created_at`;

/** Events for one school newer than a cursor — the live feed. Always school-scoped. */
export async function deliveryEventsAfter(schoolId: number, afterId: number, limit = 20): Promise<DeliveryEventRow[]> {
  await ensureDeliveryEventsTable();
  return (await query(
    `SELECT ${COLS} FROM sms_delivery_events WHERE school_id = ? AND id > ? ORDER BY id ASC LIMIT ?`,
    [schoolId, afterId, Math.min(Math.max(limit, 1), 100)],
  ).catch(() => [])) as DeliveryEventRow[];
}

/**
 * Where a newly opened stream should start: just before anything reported in the last `seconds`,
 * so a browser that reconnects does not miss a report that landed during the gap (the client
 * de-duplicates by id).
 */
export async function deliveryEventCursor(schoolId: number, seconds = 20): Promise<number> {
  await ensureDeliveryEventsTable();
  const r = ((await query(
    `SELECT COALESCE(MIN(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND) THEN id END) - 1, MAX(id), 0) AS cursor_id
       FROM sms_delivery_events WHERE school_id = ?`, [seconds, schoolId],
  ).catch(() => [])) as any[])[0];
  return Number(r?.cursor_id ?? 0);
}

/** The newest provider report per outbox row, for a page of the outbox list. Best-effort: never throws. */
export async function latestDeliveryEventsForOutbox(outboxIds: number[], schoolId: number): Promise<Map<number, DeliveryEventRow>> {
  const out = new Map<number, DeliveryEventRow>();
  const ids = outboxIds.filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) return out;
  await ensureDeliveryEventsTable();
  const rows = (await query(
    `SELECT ${COLS} FROM sms_delivery_events WHERE school_id = ? AND outbox_id IN (${ids.map(() => '?').join(',')}) ORDER BY id ASC`,
    [schoolId, ...ids],
  ).catch(() => [])) as DeliveryEventRow[];
  // Ascending order, so a later report overwrites an earlier one — except that a confirmed
  // outcome is never replaced by a late "on the network" report.
  for (const r of rows) {
    const key = Number(r.outbox_id);
    const prev = out.get(key);
    if (prev && prev.state !== 'sent' && r.state === 'sent') continue;
    out.set(key, r);
  }
  return out;
}

/** Every provider report for the messages of one outbox row, oldest first. */
export async function deliveryEventsForOutbox(outboxId: number, schoolId: number): Promise<DeliveryEventRow[]> {
  await ensureDeliveryEventsTable();
  return (await query(
    `SELECT ${COLS} FROM sms_delivery_events WHERE outbox_id = ? AND school_id = ? ORDER BY id ASC`, [outboxId, schoolId],
  ).catch(() => [])) as DeliveryEventRow[];
}
