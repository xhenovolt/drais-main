/**
 * Per-school SMS provider routing.
 *
 * The platform operator (Control Center) can decide, per school, which SMS provider/account sends
 * that school's messages:
 *   inherit  no explicit route: legacy behaviour, unchanged.
 *   central  a specific central provider (Yoola, UgaText, Africa's Talking, ...).
 *   own      the school's own credentials (comm_settings), ignoring the platform-wide active provider.
 *   same_as  "school A uses whatever school B uses" — resolved live, so NO secret is ever copied and a
 *            change to B's account is followed automatically.
 *
 * Resolution is pure (resolveRoutePlan) and cycle-safe; the DB layer only loads rows and credentials.
 * A misconfigured route FAILS LOUDLY with a reason instead of silently falling back to a different
 * account (which would hide an outage and bill the wrong owner).
 */
import { query } from '@/lib/db';
import { decryptProviderConfig, sendWithAdapter, SMS_PROVIDER_ADAPTERS, type SmsProviderType } from '@/lib/sms/providers';
import { sendAfricasTalkingSMS, type SMSResponse } from '@/lib/africastalking';

export type RouteMode = 'inherit' | 'central' | 'own' | 'same_as';
export const ROUTE_MODES: RouteMode[] = ['inherit', 'central', 'own', 'same_as'];

export interface RouteRow { mode: RouteMode; centralProviderId: number | null; sourceSchoolId: number | null }

export type RoutePlan =
  | { kind: 'legacy' }
  | { kind: 'central'; providerId: number; via: number[] }
  | { kind: 'own'; schoolId: number; via: number[] }
  | { kind: 'error'; reason: string; via: number[] };

const MAX_DEPTH = 5;

/**
 * PURE: what does `schoolId` resolve to? `routes` = explicit rows; `hasOwnCreds(id)` = does that school hold
 * its own credentials; `activeCentralId` = the platform-wide active provider (or null).
 */
export function resolveRoutePlan(
  schoolId: number,
  routes: Map<number, RouteRow>,
  hasOwnCreds: (id: number) => boolean,
  activeCentralId: number | null,
): RoutePlan {
  const via: number[] = [];
  const seen = new Set<number>();
  let cur = schoolId;
  for (let depth = 0; depth < MAX_DEPTH; depth++) {
    if (seen.has(cur)) return { kind: 'error', reason: 'Schools are set to use each other in a loop', via };
    seen.add(cur); via.push(cur);
    const row = routes.get(cur);
    const mode = row?.mode ?? 'inherit';

    if (mode === 'central') {
      return row?.centralProviderId ? { kind: 'central', providerId: row.centralProviderId, via } : { kind: 'error', reason: 'No provider was chosen', via };
    }
    if (mode === 'own') {
      return hasOwnCreds(cur) ? { kind: 'own', schoolId: cur, via } : { kind: 'error', reason: `School ${cur} has no SMS account credentials of its own`, via };
    }
    if (mode === 'same_as') {
      if (!row?.sourceSchoolId) return { kind: 'error', reason: 'No school was chosen to copy', via };
      cur = row.sourceSchoolId;
      continue;
    }
    // inherit
    if (cur === schoolId) return { kind: 'legacy' };
    // A school we were pointed at has no explicit route: use ITS account.
    if (hasOwnCreds(cur)) return { kind: 'own', schoolId: cur, via };
    if (activeCentralId) return { kind: 'central', providerId: activeCentralId, via };
    return { kind: 'error', reason: `School ${cur} has no SMS account to share`, via };
  }
  return { kind: 'error', reason: 'Route chain is too long', via };
}

/** Would saving `proposed` for `targets` create a loop or a dangling source? Returns an error message or null. */
export function validateProposedRoute(
  targets: number[], proposed: RouteRow, current: Map<number, RouteRow>,
  hasOwnCreds: (id: number) => boolean, activeCentralId: number | null,
): string | null {
  if (proposed.mode === 'same_as') {
    if (!proposed.sourceSchoolId) return 'Choose the school to copy';
    if (targets.includes(proposed.sourceSchoolId)) return 'A school cannot copy itself — remove the source school from the selection';
  }
  const next = new Map(current);
  for (const t of targets) next.set(t, proposed);
  for (const t of targets) {
    const plan = resolveRoutePlan(t, next, hasOwnCreds, activeCentralId);
    if (plan.kind === 'error') return `School ${t}: ${plan.reason}`;
  }
  return null;
}

// ── DB layer ───────────────────────────────────────────────────────────────

export async function ensureRoutesTable(): Promise<void> {
  await query(`CREATE TABLE IF NOT EXISTS school_sms_routes (
    school_id BIGINT NOT NULL PRIMARY KEY, mode VARCHAR(12) NOT NULL DEFAULT 'inherit',
    central_provider_id BIGINT DEFAULT NULL, source_school_id BIGINT DEFAULT NULL, note VARCHAR(255) DEFAULT NULL,
    updated_by BIGINT DEFAULT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, KEY idx_route_source (source_school_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []).catch(() => undefined);
}

export async function loadRoutes(): Promise<Map<number, RouteRow>> {
  const rows = (await query(`SELECT school_id, mode, central_provider_id, source_school_id FROM school_sms_routes`, []).catch(() => [])) as any[];
  return new Map(rows.map((r) => [Number(r.school_id), {
    mode: (ROUTE_MODES.includes(r.mode) ? r.mode : 'inherit') as RouteMode,
    centralProviderId: r.central_provider_id != null ? Number(r.central_provider_id) : null,
    sourceSchoolId: r.source_school_id != null ? Number(r.source_school_id) : null,
  }]));
}

export async function schoolsWithOwnCreds(): Promise<Set<number>> {
  const rows = (await query(
    `SELECT school_id FROM comm_settings
      WHERE provider_username IS NOT NULL AND provider_username <> '' AND provider_api_key IS NOT NULL AND provider_api_key <> ''`, [],
  ).catch(() => [])) as any[];
  return new Set(rows.map((r) => Number(r.school_id)));
}

export async function getActiveCentralId(): Promise<number | null> {
  const r = ((await query(`SELECT id FROM sms_provider_configs WHERE is_active = 1 AND enabled = 1 LIMIT 1`, []).catch(() => [])) as any[])[0];
  return r ? Number(r.id) : null;
}

async function ownCreds(schoolId: number): Promise<{ username: string; apiKey: string; senderName: string | null } | null> {
  const r = ((await query(
    `SELECT provider_username, provider_api_key, sender_name FROM comm_settings WHERE school_id = ? LIMIT 1`, [schoolId],
  ).catch(() => [])) as any[])[0];
  if (!r?.provider_username || !r?.provider_api_key) return null;
  return { username: String(r.provider_username), apiKey: String(r.provider_api_key), senderName: r.sender_name ?? null };
}

const cache = new Map<number, { exp: number; plan: RoutePlan }>();
export function clearRouteCache() { cache.clear(); }

export async function planForSchool(schoolId: number): Promise<RoutePlan> {
  const c = cache.get(schoolId);
  if (c && c.exp > Date.now()) return c.plan;
  const routes = await loadRoutes();
  const row = routes.get(schoolId);
  // No explicit route for this school -> legacy, without loading any credentials.
  const plan: RoutePlan = !row || row.mode === 'inherit'
    ? { kind: 'legacy' }
    : resolveRoutePlan(schoolId, routes, await hasCredsFn(), await getActiveCentralId());
  cache.set(schoolId, { exp: Date.now() + 30_000, plan });
  return plan;
}

async function hasCredsFn(): Promise<(id: number) => boolean> {
  const set = await schoolsWithOwnCreds();
  return (id) => set.has(id);
}

export interface RoutedSend { response: SMSResponse; provider: string; routeLabel: string }

/**
 * Send through the school's explicit route. Returns null when the school has NO explicit route
 * (the caller keeps its legacy behaviour). Never falls back silently when a route is broken.
 */
export async function sendViaSchoolRoute(
  schoolId: number, msg: { to: string; body: string; senderName?: string | null; recipientName?: string },
): Promise<RoutedSend | null> {
  const plan = await planForSchool(schoolId);
  if (plan.kind === 'legacy') return null;
  if (plan.kind === 'error') {
    return { response: { success: false, error: `SMS route problem: ${plan.reason}. Fix it in Control Center → SMS → School routing.` }, provider: 'none', routeLabel: 'misconfigured' };
  }
  if (plan.kind === 'own') {
    const creds = await ownCreds(plan.schoolId);
    if (!creds) return { response: { success: false, error: 'SMS route problem: the school this one copies has no credentials any more.' }, provider: 'none', routeLabel: 'misconfigured' };
    const response = await sendAfricasTalkingSMS(msg.to, msg.body, msg.recipientName, msg.senderName ?? creds.senderName ?? undefined, { username: creds.username, apiKey: creds.apiKey });
    return { response, provider: 'africas_talking', routeLabel: plan.schoolId === schoolId ? 'own account' : `account of school ${plan.schoolId}` };
  }
  const row = ((await query(`SELECT provider_type, encrypted_config, enabled FROM sms_provider_configs WHERE id = ? LIMIT 1`, [plan.providerId]).catch(() => [])) as any[])[0];
  if (!row || Number(row.enabled) !== 1) {
    return { response: { success: false, error: 'SMS route problem: the chosen provider is missing or disabled.' }, provider: 'none', routeLabel: 'misconfigured' };
  }
  let config: Record<string, any>;
  try { config = decryptProviderConfig(String(row.encrypted_config)); }
  catch { return { response: { success: false, error: 'SMS route problem: the chosen provider\'s secret could not be read.' }, provider: 'none', routeLabel: 'misconfigured' }; }
  const type = row.provider_type as SmsProviderType;
  const response = await sendWithAdapter(type, msg.to, msg.body, { ...config, senderId: msg.senderName || config.senderId });
  return { response, provider: type, routeLabel: `central ${SMS_PROVIDER_ADAPTERS[type]?.displayName ?? type}` };
}
