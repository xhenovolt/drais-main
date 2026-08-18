/**
 * Infobip WhatsApp Business provider.
 *
 * Same shape/quality bar as src/lib/africastalking.ts's sendSMS(): a single
 * async function, normalized {success, error, details} response, every
 * failure path caught and reported rather than thrown, credential
 * precedence per-call creds → env vars (INFOBIP_WHATSAPP_API_KEY /
 * INFOBIP_WHATSAPP_API_BASE_URL) — the same pattern that makes SMS work for
 * both the platform account and a school's own BYO credentials.
 *
 * IMPORTANT — WhatsApp Business messaging rule this module does NOT enforce:
 * Meta only allows a FREE-TEXT business-initiated message (what this sends)
 * inside the 24h customer-service window after the recipient last messaged
 * the business number. A cold outbound notification (attendance, fees, exam
 * results — everything DRAIS's comm engine actually sends) is normally
 * OUTSIDE that window and Meta requires a pre-approved TEMPLATE message
 * instead (Infobip's /whatsapp/1/message/template endpoint, a different
 * shape entirely, keyed to specific approved template names in the
 * account's WhatsApp Business Manager). This module supports free-text
 * only for now — real production rollout for cold notifications needs the
 * account's actual approved template names, which nobody here has
 * visibility into. See the WhatsApp plan doc; do not assume this is
 * compliant for unsolicited sends without confirming templates exist.
 */
import { normalizePhoneNumber } from '@/lib/africastalking';

export interface WhatsAppCredentials {
  baseUrl?: string | null;
  apiKey?: string | null;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  status?: string;
  error?: string;
  details?: any;
}

const SEND_TIMEOUT_MS = 15_000;

export async function sendWhatsAppMessage(
  to: string,
  body: string,
  sender?: string | null,
  creds?: WhatsAppCredentials,
): Promise<WhatsAppSendResult> {
  try {
    // Credential precedence: per-school settings (passed in) → env vars —
    // identical rule to sendSMS() in africastalking.ts.
    const baseUrl = (creds?.baseUrl || process.env.INFOBIP_WHATSAPP_API_BASE_URL || '').trim();
    const apiKey  = (creds?.apiKey  || process.env.INFOBIP_WHATSAPP_API_KEY      || '').trim();

    if (!baseUrl || !apiKey) {
      console.warn('INFOBIP_WHATSAPP credentials not configured (neither settings nor env). WhatsApp sending disabled.');
      return {
        success: false,
        error: 'WhatsApp service not configured — add the provider base URL & API key in Communication settings.',
      };
    }

    const normalizedPhone = normalizePhoneNumber(to);
    if (!normalizedPhone) {
      return { success: false, error: 'Invalid phone number format' };
    }
    if (!body || body.trim().length === 0) {
      return { success: false, error: 'Message cannot be empty' };
    }
    if (!sender || !sender.trim()) {
      return { success: false, error: 'WhatsApp sender/business number not configured for this school' };
    }

    // baseUrl is a bare host ("k9vjzn.api.infobip.com") in .env — accept
    // either that or a full https:// URL so a settings-UI override that
    // includes the scheme still works.
    const host = baseUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '');
    const url = `https://${host}/whatsapp/1/message/text`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `App ${apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          from: sender.trim(),
          to: normalizedPhone.replace(/^\+/, ''), // Infobip expects digits only, no leading +
          content: { text: body },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const json: any = await res.json().catch(() => null);

    if (!res.ok || !json) {
      // Infobip's error shape: { requestError: { serviceException: { messageId, text } } }
      const providerMessage = json?.requestError?.serviceException?.text
        || json?.requestError?.serviceException?.messageId
        || `HTTP ${res.status}`;
      console.error(`WhatsApp send failed for ${to}:`, providerMessage, json);
      return {
        success: false,
        error: `Provider rejected message: ${providerMessage}`,
        details: json,
      };
    }

    // Success shape: { to, messageCount, messageId, status: { groupId, groupName, id, name, description } }
    const statusName = json?.status?.name || json?.status?.groupName || 'UNKNOWN';
    const isRejected = json?.status?.groupName === 'REJECTED' || json?.status?.groupName === 'UNDELIVERABLE';
    if (isRejected) {
      console.error(`WhatsApp rejected for ${to}:`, statusName, json?.status?.description);
      return {
        success: false,
        error: `Provider rejected message: ${json?.status?.description || statusName}`,
        details: json,
      };
    }

    console.log(`WhatsApp sent to ${to}`, { messageId: json.messageId, status: statusName });
    return {
      success: true,
      messageId: json.messageId,
      status: statusName,
      details: json,
    };
  } catch (error: any) {
    const timedOut = error?.name === 'AbortError';
    console.error('WhatsApp sending error:', error);
    return {
      success: false,
      error: timedOut ? 'WhatsApp provider request timed out' : (error?.message || 'Failed to send WhatsApp message'),
    };
  }
}
