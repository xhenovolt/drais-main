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
 * It lives in `platform_settings`, written through the settings screen. A key
 * pasted into a file would be committed to three GitHub repositories and be
 * unrotatable without a deploy. `getNexusConfig` masks it on read; only the
 * server-side caller that actually makes the request sees the real value.
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
  const [enabled, baseUrl, model, apiKey] = await Promise.all([
    getSetting(KEYS.enabled).catch(() => null),
    getSetting(KEYS.baseUrl).catch(() => null),
    getSetting(KEYS.model).catch(() => null),
    getSetting(KEYS.apiKey).catch(() => null),
  ]);
  return {
    enabled: enabled === '1',
    baseUrl: baseUrl?.trim() || DEFAULT_BASE_URL,
    model:   model?.trim()   || DEFAULT_MODEL,
    hasKey:  !!apiKey?.trim(),
    keyHint: mask(apiKey),
  };
}

/** Server-only. Never expose the result through an API response. */
export async function getNexusApiKey(): Promise<string | null> {
  const k = await getSetting(KEYS.apiKey).catch(() => null);
  return k?.trim() || null;
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
