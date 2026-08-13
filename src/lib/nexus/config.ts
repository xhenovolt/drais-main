/**
 * Nexus — configuration.
 *
 * Nexus is the assistant that answers questions about a school's own records.
 * It is deliberately NOT called "AI" anywhere a user can see: staff ask it
 * questions about their school, and the useful framing is "ask Nexus", not
 * "use the AI".
 *
 * PROVIDER-AGNOSTIC ON PURPOSE
 * The key, base URL and model are configuration, never constants. Any
 * OpenAI-compatible endpoint works — xAI, OpenAI, a local gateway — by
 * changing three settings rather than editing code and redeploying. Defaults
 * point at xAI because that is what this was set up with.
 *
 * THE KEY IS NEVER IN THE SOURCE
 * Two places only, checked in this order:
 *
 *   1. platform_settings  — written through the settings screen, rotatable
 *                           without a deploy. Wins when present.
 *   2. NEXUS_API_KEY      — environment. Used for local development and for
 *                           hosts that manage secrets as env config (Vercel).
 *
 * Never a constant in a file: that would be committed to three GitHub
 * repositories and be unrotatable without a deploy. `.env.local` is
 * gitignored, which is what makes the environment route safe — and note it is
 * LOCAL ONLY, so production needs the same variable set in the host.
 *
 * `getNexusConfig` masks the key on read and reports which source is in force;
 * only `getNexusApiKey`, called server-side at request time, sees the real
 * value.
 */
import { getSetting, setSetting } from '@/lib/control/platform-settings';

export const NEXUS_NAME = 'Nexus';

export interface NexusConfig {
  enabled:  boolean;
  baseUrl:  string;
  model:    string;
  /** True when a key is stored. The key itself is never returned to a client. */
  hasKey:   boolean;
  /** Masked for display, e.g. "xai-…mLscYJ". */
  keyHint:  string | null;
  /** Where the key came from, so the screen can say which one is in force. */
  keySource: 'settings' | 'environment' | null;
}

const KEYS = {
  enabled: 'nexus_enabled',
  baseUrl: 'nexus_base_url',
  model:   'nexus_model',
  apiKey:  'nexus_api_key',
} as const;

/** xAI is OpenAI-compatible, so one client shape covers every provider. */
const DEFAULT_BASE_URL = 'https://api.x.ai/v1';
const DEFAULT_MODEL    = 'grok-3-mini';

function mask(key: string | null): string | null {
  if (!key) return null;
  const trimmed = key.trim();
  if (trimmed.length <= 10) return '••••';
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-6)}`;
}

/** Safe for a client: never includes the key. */
export async function getNexusConfig(): Promise<NexusConfig> {
  const [enabled, baseUrl, model, storedKey] = await Promise.all([
    getSetting(KEYS.enabled).catch(() => null),
    getSetting(KEYS.baseUrl).catch(() => null),
    getSetting(KEYS.model).catch(() => null),
    getSetting(KEYS.apiKey).catch(() => null),
  ]);

  // Mirrors getNexusApiKey's order, so the screen cannot report "no key" while
  // a request would in fact succeed from the environment — a mismatch that
  // would send someone hunting for a problem that is not there.
  const effectiveKey = storedKey?.trim() || process.env.NEXUS_API_KEY?.trim() || null;
  const fromEnv = !storedKey?.trim() && !!process.env.NEXUS_API_KEY?.trim();

  return {
    enabled: enabled === '1'
      // A key present in the environment implies intent to use it, so Nexus is
      // usable on a fresh deploy without someone first finding a checkbox.
      || (enabled === null && fromEnv),
    baseUrl: baseUrl?.trim() || process.env.NEXUS_BASE_URL?.trim() || DEFAULT_BASE_URL,
    model:   model?.trim()   || process.env.NEXUS_MODEL?.trim()    || DEFAULT_MODEL,
    hasKey:  !!effectiveKey,
    keyHint: mask(effectiveKey),
    keySource: effectiveKey ? (fromEnv ? 'environment' : 'settings') : null,
  };
}

/**
 * Server-only. Never expose the result through an API response.
 *
 * RESOLUTION ORDER: stored setting first, environment second.
 *
 * The setting wins because it is the one an operator can rotate from the
 * screen without a deploy. The environment variable is the fallback for
 * local development and for hosts where secrets are managed as env config
 * (Vercel), so the key never has to live in a file inside the repository.
 *
 * Both are read here and NOWHERE else, so there is exactly one place that
 * touches the raw key.
 */
export async function getNexusApiKey(): Promise<string | null> {
  const stored = await getSetting(KEYS.apiKey).catch(() => null);
  if (stored?.trim()) return stored.trim();
  return process.env.NEXUS_API_KEY?.trim() || null;
}

export async function saveNexusConfig(patch: {
  enabled?: boolean;
  baseUrl?: string;
  model?: string;
  /** Omit to leave unchanged; empty string clears it. */
  apiKey?: string;
}): Promise<void> {
  const writes: Promise<void>[] = [];
  if (patch.enabled !== undefined) writes.push(setSetting(KEYS.enabled, patch.enabled ? '1' : '0'));
  if (patch.baseUrl !== undefined) writes.push(setSetting(KEYS.baseUrl, patch.baseUrl.trim() || DEFAULT_BASE_URL));
  if (patch.model   !== undefined) writes.push(setSetting(KEYS.model,   patch.model.trim()   || DEFAULT_MODEL));
  if (patch.apiKey  !== undefined) writes.push(setSetting(KEYS.apiKey,  patch.apiKey.trim() || null));
  await Promise.all(writes);
}
