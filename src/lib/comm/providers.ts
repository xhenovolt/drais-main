/**
 * Provider abstraction. Each provider knows how to deliver a single
 * message and reports a normalised result. The dispatcher selects a
 * provider by name (resolved from comm_settings.default_provider, or
 * overridden per-call).
 *
 * Adding a new provider:
 *   1. Implement CommProvider here (or in providers/<name>.ts).
 *   2. Register it in PROVIDERS below.
 *   3. Allow its code from the settings UI.
 */
import { sendSMS, normalizePhoneNumber } from '@/lib/africastalking';
import type { CommChannel } from './events';

export interface SendArgs {
  to:          string;
  body:        string;
  senderName?: string;
}

export interface SendResult {
  success:           boolean;
  providerMessageId: string | null;
  cost:              string | null;
  error:             string | null;
}

export interface CommProvider {
  name:               string;
  channel:            CommChannel;
  send(args: SendArgs): Promise<SendResult>;
}

/** Africa's Talking SMS — wraps the existing lib/africastalking helper. */
const africasTalkingSms: CommProvider = {
  name:    'africas_talking',
  channel: 'sms',
  async send({ to, body, senderName }) {
    const normalised = normalizePhoneNumber(to);
    if (!normalised) {
      return { success: false, providerMessageId: null, cost: null, error: 'Invalid phone number' };
    }
    const r = await sendSMS(normalised, body, undefined, senderName);
    return {
      success:           r.success,
      providerMessageId: r.messageId ?? null,
      cost:              r.cost ?? null,
      error:             r.success ? null : (r.error ?? 'Unknown provider error'),
    };
  },
};

/** Console "provider" — for local dev when no AT credentials. The
 *  dispatcher falls back to this if AFRICASTALKING_API_KEY isn't set,
 *  so devs can still see what *would* have been sent. */
const consoleProvider: CommProvider = {
  name:    'console',
  channel: 'sms',
  async send({ to, body, senderName }) {
    console.log(`[COMM:console] → ${to} (from ${senderName ?? 'DRAIS'}): ${body}`);
    return { success: true, providerMessageId: `console-${Date.now()}`, cost: '0', error: null };
  },
};

const PROVIDERS: Record<string, CommProvider> = {
  africas_talking: africasTalkingSms,
  console:         consoleProvider,
};

/** Return a provider by name, with sensible fallback. If the requested
 *  provider isn't registered, we fall back to console (so dev/CI never
 *  crashes on "SMS service not found" — the historical bug). */
export function getProvider(name: string, channel: CommChannel = 'sms'): CommProvider {
  const p = PROVIDERS[name];
  if (p && p.channel === channel) return p;

  // If credentials are missing for the default provider, log loudly and
  // use the console provider so the dispatcher keeps producing audit
  // rows. This is the difference between "broken" and "degraded".
  if (channel === 'sms') {
    if (!process.env.AFRICASTALKING_API_KEY || !process.env.AFRICASTALKING_USERNAME) {
      console.warn(
        `[comm] provider '${name}' unavailable (credentials missing) — falling back to console`,
      );
    } else {
      console.warn(`[comm] unknown provider '${name}' — falling back to console`);
    }
  }
  return consoleProvider;
}

export function listProviders(): { name: string; channel: CommChannel }[] {
  return Object.values(PROVIDERS).map(p => ({ name: p.name, channel: p.channel }));
}
