/**
 * Provider key health — a periodic, free check of whether the SMS provider currently accepts
 * DRAIS's credentials.
 *
 * Why: UgaText has repeatedly answered "Invalid or revoked API key" for a key that worked before
 * and worked again later, with no change on our side (2026-10-10, -11, -13). Without a record,
 * every episode looks like "the key revoked itself" and the only evidence is failed messages.
 * This writes one `key_check` row per check to sms_provider_operations, so there is an exact
 * timeline of when the key stopped and started being accepted — to act on, and to give the
 * provider's support. It also flips the provider's status early, so the send queue pauses
 * (see providerPacingForSchool) before a morning rush instead of on the first parent's message.
 *
 * It only ASKS (GET /auth/verify). It never sends an SMS, never changes the stored key, and
 * never throws.
 *
 * Scheduling: there is no reliable cron on this deployment, so it rides on the same request
 * paths that pump the outbox (device heartbeats). The interval is enforced in the database, so
 * any number of server instances together make at most one check per interval.
 */
import { query } from '@/lib/db';
import { checkUgaTextKey, decryptProviderConfig } from '@/lib/sms/providers';

/** Minutes between checks while the key is being accepted. */
export const KEY_CHECK_INTERVAL_MINUTES = 15;
/** Minutes between checks while it is being refused (recover quickly, without hammering). */
export const KEY_CHECK_INTERVAL_WHEN_REFUSED_MINUTES = 3;

export interface KeyHealthResult { checked: number; refused: number; skipped: number }

let inFlight = false;

export async function checkProviderKeys(): Promise<KeyHealthResult> {
  const out: KeyHealthResult = { checked: 0, refused: 0, skipped: 0 };
  if (inFlight) return out;
  inFlight = true;
  try {
    const providers = (await query(
      `SELECT id, provider_type, encrypted_config, status FROM sms_provider_configs WHERE enabled = 1 AND provider_type = 'ugatext'`, [],
    ).catch(() => [])) as any[];

    for (const p of providers) {
      const interval = p.status === 'authentication_failed' ? KEY_CHECK_INTERVAL_WHEN_REFUSED_MINUTES : KEY_CHECK_INTERVAL_MINUTES;
      const recent = (await query(
        `SELECT 1 FROM sms_provider_operations
          WHERE provider_id = ? AND operation = 'key_check' AND created_at > DATE_SUB(NOW(), INTERVAL ? MINUTE) LIMIT 1`, [p.id, interval],
      ).catch(() => [1])) as unknown[];
      if (recent.length) { out.skipped++; continue; }

      let config: Record<string, any>;
      try { config = decryptProviderConfig(String(p.encrypted_config)); } catch { out.skipped++; continue; }

      // Claim the slot BEFORE the network call, so two instances waking together do not both ask.
      const ins = (await query(
        `INSERT INTO sms_provider_operations (provider_id, provider_type, operation, success, metadata_json) VALUES (?, ?, 'key_check', 0, ?)`,
        [p.id, p.provider_type, JSON.stringify({ pending: true })],
      ).catch(() => null)) as { insertId?: number } | null;
      if (!ins?.insertId) { out.skipped++; continue; }

      const r = await checkUgaTextKey(config);
      out.checked++;
      const refused = r.httpStatus === 401 || r.httpStatus === 403;
      if (refused) out.refused++;
      await query(
        `UPDATE sms_provider_operations SET success = ?, http_status = ?, error_message = ?, metadata_json = ? WHERE id = ?`,
        [r.ok ? 1 : 0, r.httpStatus, r.ok ? null : r.message, JSON.stringify({ requestId: r.requestId, via: r.via, statusBefore: p.status }), ins.insertId],
      ).catch(() => undefined);

      // Only a definite answer changes the provider's status. An unreachable gateway
      // (httpStatus null) or a 5xx says nothing about the key.
      if (refused) {
        await query(
          `UPDATE sms_provider_configs SET status = 'authentication_failed', status_message = ?, last_failure_at = NOW() WHERE id = ?`,
          [`UgaText is refusing DRAIS's key (key check): ${r.message ?? 'HTTP ' + r.httpStatus}. Messages are held and retried automatically.`.slice(0, 500), p.id],
        ).catch(() => undefined);
      } else if (r.ok && p.status === 'authentication_failed') {
        await query(`UPDATE sms_provider_configs SET status = 'connected', status_message = NULL WHERE id = ? AND status = 'authentication_failed'`, [p.id]).catch(() => undefined);
      }
    }
  } catch { /* never let a health check break the caller */ }
  finally { inFlight = false; }
  return out;
}
