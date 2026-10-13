/**
 * Phase 5 outbox drainer — extracted core.
 *
 * The original implementation lived inside the GET handler of
 * /api/cron/notification-drain. The audit found that route was never
 * scheduled (vercel.json has no cron for it, and the Vercel hobby plan
 * does not allow adding more), so queued notifications never sent.
 *
 * The core now lives here so TWO callers can pump the queue:
 *
 *   1. /api/cron/notification-drain — manual / externally-scheduled
 *      invocation (cron-job.org, school server crontab, etc.).
 *   2. The ZKTeco heartbeat path (zk-handler GET) via
 *      drainOutboxOpportunistically() — devices poll every ~30-60s,
 *      which makes them a free scheduler. The call is throttled
 *      per-process and fire-and-forget so it never slows the ADMS
 *      response.
 *
 * Concurrency safety: a batch is claimed by flipping status queued →
 * sending and stamping the rows with this run's claim_token. A run only
 * ever reads and updates rows carrying its own token, so overlapping
 * drains (several warm instances, cron + heartbeat) cannot send the same
 * message twice.
 *
 * Pacing: providers with a per-minute cap get a per-run budget, and a
 * "rate limit" answer puts the message back with its attempt refunded.
 */
import { randomUUID } from 'node:crypto';
import { query } from '@/lib/db';
import { getProvider } from '@/lib/comm/providers';
import { getCommSettings } from '@/lib/comm/settings';
import { ensureNotificationSchema } from '@/lib/notifications/migrations/notification-tables-schema';
import { revalidateQueuedAttendanceMessage } from '@/lib/notifications/attendance-sms-eligibility';
import { recordSmsUsage } from '@/lib/sms/usage';
import { sendViaSchoolRoute, providerPacingForSchool, KEY_REFUSED_PAUSE_SECONDS } from '@/lib/sms/school-routing';
import { notifyDeliveryStatus } from '@/lib/sms/delivery-alerts';
import { checkProviderKeys } from '@/lib/sms/key-health';

const BATCH = 50;
/** How long a message waits when the provider's per-minute budget is used up. */
const PACING_DELAY_SECONDS = 45;
/** Shown on a held message while the provider is refusing our credentials. */
const KEY_REFUSED_NOTE = "Waiting: the SMS provider is refusing DRAIS's key. Messages are held and will send automatically when it is accepted again";

export interface DrainResult {
  attempted: number;
  delivered: number;
  failed: number;
  requeued: number;
  /** Put back untouched (no attempt used) because the provider's rate limit left no room. */
  deferred: number;
}

interface OutboxRow {
  id: number;
  school_id: number;
  channel: 'sms' | 'email' | 'push';
  body: string;
  recipient_phone: string | null;
  recipient_email: string | null;
  recipient_name: string | null;
  attempts: number;
  max_attempts: number;
  dedup_key: string | null;
}

let claimColumnReady: Promise<void> | null = null;
/** notification_outbox.claim_token — which drain run owns a 'sending' row. Added on demand. */
function ensureClaimColumn(): Promise<void> {
  if (claimColumnReady) return claimColumnReady;
  // Two statements: TiDB rejects adding a column and an index on it in one ALTER
  // ("column does not exist"). Each is ignored when it already exists.
  claimColumnReady = (async () => {
    await query(`ALTER TABLE notification_outbox ADD COLUMN claim_token VARCHAR(40) DEFAULT NULL`, []).catch(() => undefined);
    await query(`ALTER TABLE notification_outbox ADD KEY idx_outbox_claim (claim_token)`, []).catch(() => undefined);
  })();
  return claimColumnReady;
}

export async function drainNotificationOutbox(): Promise<DrainResult> {
  const result: DrainResult = { attempted: 0, delivered: 0, failed: 0, requeued: 0, deferred: 0 };

  await ensureNotificationSchema();
  await ensureClaimColumn();

  // A drainer that died mid-batch leaves rows in 'sending' forever. Whether
  // the provider already accepted them is unknowable, so retrying could
  // double-text a parent; close them out instead of resending.
  await query(
    `UPDATE notification_outbox
        SET status = 'expired',
            last_error = 'Interrupted while sending; delivery unknown - not retried'
      WHERE status = 'sending'
        AND attempted_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)`,
    [],
  ).catch(() => undefined);

  // Atomically claim a batch by flipping to 'sending' AND stamping it with this run's token.
  //
  // The token is what makes overlapping drains safe. The claim used to be followed by
  // "select rows that are 'sending' and were attempted in the last 30 seconds", which also
  // matched rows claimed by ANOTHER drain running at the same moment — both then sent the same
  // SMS. Worse, when one of them was rejected (e.g. rate-limited) it re-queued a message the
  // other had already delivered, so it went out again minutes later. Measured on production:
  // 16-70 duplicate attendance SMS per school day (2026-09-29 .. 2026-10-12).
  const token = `${Date.now().toString(36)}-${randomUUID().slice(0, 18)}`;
  const claim = (await query(
    `UPDATE notification_outbox
        SET status = 'sending',
            attempts = attempts + 1,
            attempted_at = CURRENT_TIMESTAMP,
            claim_token = ?
      WHERE status = 'queued'
        AND scheduled_at <= CURRENT_TIMESTAMP
      ORDER BY scheduled_at ASC, id ASC
      LIMIT ${BATCH}`,
    [token],
  )) as { affectedRows?: number };
  if (!claim || !claim.affectedRows) return result;

  // Only the rows THIS run claimed.
  const rows = (await query(
    `SELECT id, school_id, channel, body, recipient_phone,
            recipient_email, recipient_name, attempts, max_attempts, dedup_key
       FROM notification_outbox
      WHERE status = 'sending' AND claim_token = ?
      ORDER BY scheduled_at ASC, id ASC
      LIMIT ${BATCH}`,
    [token],
  )) as OutboxRow[];

  // Every transition below is conditional on still owning the row, so a run can never undo
  // or repeat what another run (or a manual resend) did to the same message.
  const OWNED = `id = ? AND status = 'sending' AND claim_token = ?`;
  const markFailed = (id: number, reason: string) => query(
    `UPDATE notification_outbox SET status = 'failed', last_error = ?, claim_token = NULL WHERE ${OWNED}`,
    [reason.slice(0, 255), id, token],
  );
  const requeue = (id: number, attempts: number, error: string) => query(
    `UPDATE notification_outbox
        SET status = 'queued', scheduled_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND), last_error = ?, claim_token = NULL
      WHERE ${OWNED}`,
    [Math.min(60 * attempts, 600), error.slice(0, 255), id, token],
  );
  /** Put a row back WITHOUT spending one of its attempts: waiting on a rate limit is not a failure. */
  const release = (id: number, delaySeconds: number, note: string | null) => query(
    `UPDATE notification_outbox
        SET status = 'queued', attempts = GREATEST(attempts - 1, 0),
            scheduled_at = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL ? SECOND), last_error = ?, claim_token = NULL
      WHERE ${OWNED}`,
    [Math.max(1, Math.round(delaySeconds)), note, id, token],
  );

  // Per-school credential cache for this drain run (avoid a DB read per row).
  const credsCache = new Map<number, { username: string | null; apiKey: string | null; smsEnabled: boolean }>();
  const credsFor = async (schoolId: number) => {
    if (credsCache.has(schoolId)) return credsCache.get(schoolId)!;
    let c = { username: null as string | null, apiKey: null as string | null, smsEnabled: true };
    try {
      const s = await getCommSettings(schoolId);
      c = { username: s.providerUsername ?? null, apiKey: s.providerApiKey ?? null, smsEnabled: s.smsEnabled };
    } catch { /* fall back to env inside sendSMS */ }
    credsCache.set(schoolId, c);
    return c;
  };

  // Provider pacing. A provider with a per-minute cap (UgaText: 60 requests/min per account) is
  // given a budget for this run = cap − what was already sent through it in the last minute.
  // When it is used up, the rest of the batch waits instead of being fired at the provider only
  // to be rejected. Keyed by provider so two schools on the same account share one budget.
  const budgets = new Map<number, { remaining: number }>();
  /** Set when a provider says "rate limit" or refuses our key: everything left for it this run
   *  waits this long, with the reason shown on the held message. */
  const coolingDown = new Map<number, { wait: number; note: string | null }>();
  const paceCache = new Map<number, { providerId: number; budget: { remaining: number } } | null>();
  const paceFor = async (schoolId: number) => {
    if (paceCache.has(schoolId)) return paceCache.get(schoolId)!;
    const p = await providerPacingForSchool(schoolId).catch(() => null);
    let out: { providerId: number; budget: { remaining: number } } | null = null;
    if (p) {
      let budget = budgets.get(p.providerId);
      if (!budget) { budget = { remaining: p.remaining }; budgets.set(p.providerId, budget); }
      out = { providerId: p.providerId, budget };
      // The provider refused our key moments ago (this run or another one): do not spend a
      // request per message finding that out again. Hold everything for it until the pause ends.
      if (p.holdSeconds > 0 && !coolingDown.has(p.providerId)) coolingDown.set(p.providerId, { wait: p.holdSeconds, note: KEY_REFUSED_NOTE });
    }
    paceCache.set(schoolId, out);
    return out;
  };

  for (const row of rows) {
    try {
      if (row.channel !== 'sms') {
        result.attempted++;
        await markFailed(row.id, `Channel ${row.channel} not implemented`);
        result.failed++;
        continue;
      }
      const stillValid = await revalidateQueuedAttendanceMessage(row.school_id, row.dedup_key);
      if (!stillValid.eligible) {
        result.attempted++;
        await query(
          `UPDATE notification_outbox SET status = 'expired', last_error = ?, claim_token = NULL WHERE ${OWNED}`,
          [`Suppressed before send: ${stillValid.reason}`, row.id, token],
        );
        result.failed++;
        continue;
      }
      const recipient = row.recipient_phone;
      if (!recipient) {
        result.attempted++;
        await markFailed(row.id, 'No recipient phone');
        result.failed++;
        continue;
      }
      const creds = await credsFor(row.school_id);
      if (!creds.smsEnabled) {
        result.attempted++;
        await markFailed(row.id, 'SMS disabled for this school');
        result.failed++;
        continue;
      }

      const pace = await paceFor(row.school_id);
      const cooling = pace ? coolingDown.get(pace.providerId) : undefined;
      if (pace && (pace.budget.remaining <= 0 || cooling != null)) {
        await release(row.id, cooling?.wait ?? PACING_DELAY_SECONDS, cooling?.note ?? null);
        result.deferred++;
        continue;
      }
      if (pace) pace.budget.remaining--;
      result.attempted++;

      // Control Center → SMS → School routing: an explicit route wins. With none, behaviour is unchanged
      // (the school's own Africa's Talking credentials, then the platform's).
      const routed = await sendViaSchoolRoute(row.school_id, { to: recipient, body: row.body, senderName: undefined });
      const provider = getProvider('africas_talking', 'sms');
      const sendResult = routed
        ? {
            success: routed.response.success,
            providerMessageId: routed.response.messageId ?? null,
            cost: routed.response.cost ?? null,
            error: routed.response.error ?? null,
          }
        : await provider.send({
            to: recipient,
            body: row.body,
            senderName: undefined,
            creds: { username: creds.username, apiKey: creds.apiKey },
          });

      // The provider's rate limit is not a verdict on this message: put it back with its attempt
      // refunded, wait as long as the provider asked, and hold the rest of the batch too.
      if (!sendResult.success && routed?.response.rateLimited) {
        const wait = Math.min(Math.max(routed.response.retryAfterSeconds ?? 20, 5), 120) + 5;
        if (pace) { coolingDown.set(pace.providerId, { wait, note: null }); pace.budget.remaining = 0; }
        await release(row.id, wait, 'Waiting for the SMS provider (rate limit) — will send automatically');
        result.attempted--;
        result.deferred++;
        continue;
      }

      // The provider refused our KEY, not this message. UgaText has done this to a valid key
      // for a while and then accepted it again with nothing changed on our side, so a refusal
      // must not use up the message's attempts and turn into a permanent failure. Hold it (and
      // the rest of the batch), try again after a pause, and let it send by itself on recovery.
      if (!sendResult.success && routed?.response.authRejected) {
        if (pace) { coolingDown.set(pace.providerId, { wait: KEY_REFUSED_PAUSE_SECONDS, note: KEY_REFUSED_NOTE }); pace.budget.remaining = 0; }
        await release(row.id, KEY_REFUSED_PAUSE_SECONDS, KEY_REFUSED_NOTE);
        result.attempted--;
        result.deferred++;
        continue;
      }

      await query(
        `INSERT INTO notification_deliveries
           (outbox_id, school_id, provider, provider_message_id, cost, success, error)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          row.id,
          row.school_id,
          routed ? routed.provider : provider.name,
          sendResult.providerMessageId,
          sendResult.cost,
          sendResult.success ? 1 : 0,
          sendResult.error,
        ],
      );

      if (sendResult.success) {
        // last_error is cleared: an earlier retry's reason must not keep showing as a "Problem"
        // on a message the provider has now accepted.
        await query(
          `UPDATE notification_outbox
              SET status = 'delivered', delivered_at = CURRENT_TIMESTAMP, last_error = NULL, claim_token = NULL
            WHERE ${OWNED}`,
          [row.id, token],
        );
        // Charge the school's allowance. Attendance SMS is safety-relevant, so it is RECORDED
        // (dashboard + Control Center stay accurate) but never blocked by the allowance.
        await recordSmsUsage({ schoolId: row.school_id, source: 'attendance', body: row.body, ref: `ob:${row.id}` });
        result.delivered++;
      } else if (row.attempts >= row.max_attempts) {
        await markFailed(row.id, sendResult.error ?? 'Provider rejected');
        result.failed++;
        // The provider refused it for good: tell the school's delivery-alert number.
        await notifyDeliveryStatus({
          schoolId: row.school_id, state: 'failed', reason: sendResult.error ?? 'Provider rejected',
          recipientName: row.recipient_name, recipientPhone: row.recipient_phone, outboxId: row.id,
        });
      } else {
        await requeue(row.id, row.attempts, sendResult.error ?? 'Provider error');
        result.requeued++;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (row.attempts >= row.max_attempts) {
        await markFailed(row.id, msg);
        result.failed++;
      } else {
        await requeue(row.id, row.attempts, msg);
        result.requeued++;
      }
    }
  }

  return result;
}

// ── Opportunistic pump (heartbeat-driven, no cron required) ───────────

let lastOpportunisticDrain = 0;
let drainInFlight = false;
const OPPORTUNISTIC_INTERVAL_MS = 90_000;

/**
 * Called from high-frequency request paths (ZKTeco heartbeats). At most
 * one drain per process per 90s; never throws. Returns the drain promise
 * so Next's after() can keep the work alive after the response. On Vercel each warm lambda instance throttles independently —
 * worst case a few extra drains, which the queued→sending claim makes
 * safe.
 */
export function drainOutboxOpportunistically(): Promise<void> {
  const now = Date.now();
  if (drainInFlight || now - lastOpportunisticDrain < OPPORTUNISTIC_INTERVAL_MS) return Promise.resolve();
  lastOpportunisticDrain = now;
  drainInFlight = true;
  // Key health first (rate-limited in the database to one check per interval): if the provider
  // is refusing our key, the drain that follows sees that and holds messages instead of
  // spending their attempts. It also keeps the key in regular use through quiet hours.
  return checkProviderKeys()
    .catch(() => undefined)
    .then(() => drainNotificationOutbox())
    .then((r) => {
      if (r.attempted > 0) {
        console.log(JSON.stringify({
          ts: new Date().toISOString(), type: 'NOTIFICATION_DRAIN',
          trigger: 'heartbeat', ...r,
        }));
      }
    })
    .catch((err) => console.warn('[notifications/drain] opportunistic drain failed:', err))
    .finally(() => { drainInFlight = false; });
}
